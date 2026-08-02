import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { Composer } from '@/src/components/Composer'
import { MessageBubble } from '@/src/components/MessageBubble'
import type { Conversation, InstalledModel, Message } from '@/src/domain/types'
import { t } from '@/src/i18n'
import * as chatStore from '@/src/services/chatStore'
import * as inference from '@/src/services/inference'
import { listInstalled, touchLastUsed } from '@/src/services/modelStore'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

function defaultTitle(): string {
  return t('chats.new')
}

function buildContext(messages: Message[]): { role: Message['role']; content: string }[] {
  const complete = messages.filter((m) => m.status === 'complete' || m.role === 'user')
  const selected: Message[] = []
  let budget = 1500
  for (let i = complete.length - 1; i >= 0; i--) {
    const m = complete[i]
    const cost = Math.ceil(m.content.length / 4)
    if (selected.length && budget - cost < 0) break
    selected.unshift(m)
    budget -= cost
  }
  return selected.map((m) => ({ role: m.role, content: m.content }))
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const db = useSQLiteContext()
  const navigation = useNavigation()
  const { colors } = useTheme()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [installed, setInstalled] = useState<InstalledModel[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const streamingId = useRef<string | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    const [allConvos, msgs, models] = await Promise.all([
      chatStore.listConversations(db),
      chatStore.getMessages(db, id),
      listInstalled(db),
    ])
    setConversation(allConvos.find((c) => c.id === id) ?? null)
    setMessages(msgs)
    setInstalled(models)
  }, [db, id])

  useEffect(() => {
    void reload()
  }, [reload])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: conversation?.title ?? t('chats.new'),
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (!conversation || installed.length < 2) return
            const idx = installed.findIndex((m) => m.id === conversation.modelId)
            const next = installed[(idx + 1) % installed.length]
            void chatStore.setConversationModel(db, conversation.id, next.id).then(async () => {
              setBanner(t('chat.modelSwitch', { name: next.displayName }))
              await reload()
            })
          }}
          style={{ paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: colors.primary, fontFamily: typography.bodyMediumFamily }} numberOfLines={1}>
            {installed.find((m) => m.id === conversation?.modelId)?.displayName ?? t('chat.noModel')}
          </Text>
        </Pressable>
      ),
    })
  }, [navigation, conversation, installed, colors.primary, db, reload])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void inference.stop()
      }
    })
    return () => sub.remove()
  }, [])

  const send = async () => {
    if (!id || !conversation || streaming) return
    const text = draft.trim()
    if (!text) return
    const model = installed.find((m) => m.id === conversation.modelId)
    if (!model) return

    setDraft('')
    setStreaming(true)
    setBanner(null)

    await chatStore.appendMessage(db, {
      conversationId: id,
      role: 'user',
      content: text,
      status: 'complete',
    })

    if (conversation.title === defaultTitle() || conversation.title === 'New chat') {
      const title = text.slice(0, 40)
      await chatStore.setConversationTitle(db, id, title)
    }

    const assistant = await chatStore.appendMessage(db, {
      conversationId: id,
      role: 'assistant',
      content: '',
      status: 'streaming',
    })
    streamingId.current = assistant.id
    await reload()

    try {
      await inference.loadModel(model.localPath)
      await touchLastUsed(db, model.id)
      const history = await chatStore.getMessages(db, id)
      const context = buildContext(history.filter((m) => m.id !== assistant.id))
      context.push({ role: 'user', content: text })

      let buffer = ''
      let lastFlush = Date.now()
      const { text: finalText } = await inference.completeChat({
        messages: context,
        onToken: (token) => {
          buffer += token
          const now = Date.now()
          if (now - lastFlush > 50) {
            lastFlush = now
            const snapshot = buffer
            void chatStore.updateMessage(db, assistant.id, { content: snapshot })
            setMessages((prev) =>
              prev.map((m) => (m.id === assistant.id ? { ...m, content: snapshot } : m)),
            )
          }
        },
      })
      await chatStore.updateMessage(db, assistant.id, {
        content: finalText || buffer,
        status: 'complete',
      })
    } catch {
      const current = (await chatStore.getMessages(db, id)).find((m) => m.id === assistant.id)
      await chatStore.updateMessage(db, assistant.id, {
        content: current?.content ?? '',
        status: 'error',
      })
    } finally {
      streamingId.current = null
      setStreaming(false)
      await reload()
    }
  }

  const onStop = async () => {
    await inference.stop()
  }

  const modelReady = !!installed.find((m) => m.id === conversation?.modelId)

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {banner ? (
        <Text style={[styles.banner, { color: colors.foreground, fontFamily: typography.bodyFamily }]}>
          {banner}
        </Text>
      ) : null}
      <FlatList
        data={messages.filter((m) => m.role !== 'system')}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        renderItem={({ item }) => (
          <View>
            <MessageBubble role={item.role} content={item.content} status={item.status} />
            {item.status === 'error' ? (
              <Pressable onPress={() => void send()} style={{ paddingHorizontal: 16 }}>
                <Text style={{ color: colors.primary, fontFamily: typography.bodyMediumFamily }}>
                  {t('chat.retry')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
      <Composer
        value={draft}
        onChangeText={setDraft}
        onSend={() => void send()}
        onStop={() => void onStop()}
        placeholder={t('chat.placeholder')}
        sendLabel={t('chat.send')}
        stopLabel={t('chat.stop')}
        disabled={!modelReady}
        streaming={streaming}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
})
