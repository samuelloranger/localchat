import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { Composer } from '@/src/components/Composer'
import { MessageBubble } from '@/src/components/MessageBubble'
import type { Conversation, InstalledModel, Message } from '@/src/domain/types'
import { useTranslation } from '@/src/i18n/LocaleProvider'
import * as chatStore from '@/src/services/chatStore'
import { evaluateModelFit } from '@/src/services/deviceCapability'
import * as inference from '@/src/services/inference'
import { listInstalled, touchLastUsed } from '@/src/services/modelStore'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

import { buildContext } from '@/src/chat/buildContext'
import { formatModelLabel, formatProvenance } from '@/src/chat/modelLabel'
import { useDeviceRam } from '@/src/hooks/useDeviceRam'

const UI_FLUSH_MS = 50
const DB_FLUSH_MS = 750

type RunCompletionParams = {
  db: ReturnType<typeof useSQLiteContext>
  conversationId: string
  model: InstalledModel
  assistantId: string
  mountedRef: React.RefObject<boolean>
  streamingBufferRef: React.MutableRefObject<string>
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  onSpeed: (tokensPerSecond: number | null) => void
}

async function runCompletion({
  db,
  conversationId,
  model,
  assistantId,
  mountedRef,
  streamingBufferRef,
  setMessages,
  onSpeed,
}: RunCompletionParams): Promise<void> {
  await inference.loadModel(model.localPath)
  await touchLastUsed(db, model.id)

  const history = await chatStore.getMessages(db, conversationId)
  const context = buildContext(history.filter((m) => m.id !== assistantId))

  let buffer = ''
  let lastUiFlush = Date.now()
  let lastDbFlush = Date.now()

  const flushUi = (snapshot: string) => {
    if (!mountedRef.current) return
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot, status: 'streaming' } : m)),
    )
  }

  const flushDb = async (snapshot: string) => {
    await chatStore.updateMessage(db, assistantId, { content: snapshot })
  }

  try {
    const { text: finalText, tokensPerSecond } = await inference.completeChat({
      messages: context,
      onToken: (token) => {
        buffer += token
        streamingBufferRef.current = buffer
        const now = Date.now()
        if (now - lastUiFlush >= UI_FLUSH_MS) {
          lastUiFlush = now
          flushUi(buffer)
        }
        if (now - lastDbFlush >= DB_FLUSH_MS) {
          lastDbFlush = now
          void flushDb(buffer)
        }
      },
    })

    const content = finalText || buffer
    onSpeed(tokensPerSecond)
    await chatStore.updateMessage(db, assistantId, { content, status: 'complete' })
    if (mountedRef.current) {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content, status: 'complete' } : m)),
      )
    }
  } catch {
    const current = (await chatStore.getMessages(db, conversationId)).find((m) => m.id === assistantId)
    const content = current?.content ?? buffer
    await chatStore.updateMessage(db, assistantId, { content, status: 'error' })
    if (mountedRef.current) {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content, status: 'error' } : m)),
      )
    }
  }
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const db = useSQLiteContext()
  const navigation = useNavigation()
  const { colors } = useTheme()
  const { t } = useTranslation()
  const deviceRam = useDeviceRam()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [installed, setInstalled] = useState<InstalledModel[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [infoBanner, setInfoBanner] = useState<string | null>(null)
  const [overBudgetDismissed, setOverBudgetDismissed] = useState(false)
  // Speed is per generated turn and only known for turns produced in this
  // session; older replies still show the model name, just without a rate.
  const [speedById, setSpeedById] = useState<Record<string, number | null>>({})
  const listRef = useRef<FlatList<Message>>(null)
  const mountedRef = useRef(true)
  const streamingBufferRef = useRef('')
  const streamingIdRef = useRef<string | null>(null)

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

  const activeModel = useMemo(
    () => installed.find((m) => m.id === conversation?.modelId) ?? null,
    [installed, conversation?.modelId],
  )

  const modelFit = useMemo(
    () => (activeModel ? evaluateModelFit(activeModel.sizeBytes, deviceRam) : null),
    [activeModel, deviceRam],
  )

  const hasInstalledModel = !!activeModel

  // Identity is stated once, on the conversation's opening reply.
  const firstReplyId = useMemo(
    () => messages.find((m) => m.role === 'assistant')?.id ?? null,
    [messages],
  )
  const showOverBudgetBanner = !!modelFit && !modelFit.fits && !overBudgetDismissed

  const modelLabel = activeModel ? formatModelLabel(activeModel.displayName) : t('chat.noModel')

  const cycleModel = useCallback(() => {
    if (!conversation || installed.length < 2) return
    const idx = installed.findIndex((m) => m.id === conversation.modelId)
    const next = installed[(idx + 1) % installed.length]
    void chatStore.setConversationModel(db, conversation.id, next.id).then(async () => {
      setInfoBanner(t('chat.modelSwitch', { name: formatModelLabel(next.displayName) }))
      setOverBudgetDismissed(false)
      await reload()
    })
  }, [conversation, installed, db, t, reload])

  // The header carries two facts with different weights: what this conversation
  // is (title, in the display face) and which model is answering (secondary,
  // and the control that changes it). Stacking them keeps the model name
  // readable instead of truncating it into a headerRight sliver.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitleAlign: 'center',
      headerTitle: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={modelLabel}
          accessibilityHint={installed.length > 1 ? t('chat.modelSwitchHint') : undefined}
          disabled={installed.length < 2}
          onPress={cycleModel}
          style={styles.headerTitle}
        >
          <Text
            numberOfLines={1}
            style={[styles.headerName, { color: colors.foreground }]}
          >
            {conversation?.title ?? t('chats.new')}
          </Text>
          <Text numberOfLines={1} style={[styles.headerModel, { color: colors.mutedForeground }]}>
            {modelLabel}
          </Text>
        </Pressable>
      ),
      headerRight: undefined,
    })
  }, [navigation, conversation, installed.length, colors, t, modelLabel, cycleModel])

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        void inference.stop()
        const sid = streamingIdRef.current
        const buf = streamingBufferRef.current
        if (sid && buf) {
          void chatStore.updateMessage(db, sid, { content: buf })
        }
      }
    }, [db]),
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void inference.stop()
      }
    })
    return () => {
      sub.remove()
      mountedRef.current = false
      void inference.stop()
    }
  }, [])

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.role !== 'system'),
    [messages],
  )

  useEffect(() => {
    if (!visibleMessages.length) return
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true })
    })
  }, [visibleMessages.length, visibleMessages[visibleMessages.length - 1]?.content])

  const send = async () => {
    if (!id || !conversation || streaming || !activeModel) return
    const text = draft.trim()
    if (!text) return

    setDraft('')
    setStreaming(true)
    setInfoBanner(null)

    await chatStore.appendMessage(db, {
      conversationId: id,
      role: 'user',
      content: text,
      status: 'complete',
    })

    if (conversation.title === t('chats.new') || conversation.title === 'New chat') {
      await chatStore.setConversationTitle(db, id, text.slice(0, 40))
    }

    const assistant = await chatStore.appendMessage(db, {
      conversationId: id,
      role: 'assistant',
      content: '',
      status: 'streaming',
    })
    streamingIdRef.current = assistant.id
    streamingBufferRef.current = ''
    await reload()

    await runCompletion({
      db,
      conversationId: id,
      model: activeModel,
      assistantId: assistant.id,
      mountedRef,
      streamingBufferRef,
      setMessages,
      onSpeed: (rate) => setSpeedById((prev) => ({ ...prev, [assistant.id]: rate })),
    })

    streamingIdRef.current = null
    streamingBufferRef.current = ''
    setStreaming(false)
    await reload()
  }

  const retryAssistant = async (assistantId: string) => {
    if (!id || !conversation || streaming || !activeModel) return

    setStreaming(true)
    await chatStore.updateMessage(db, assistantId, { content: '', status: 'streaming' })
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, content: '', status: 'streaming' } : m)),
    )
    streamingIdRef.current = assistantId

    await runCompletion({
      db,
      conversationId: id,
      model: activeModel,
      assistantId,
      mountedRef,
      streamingBufferRef,
      setMessages,
      onSpeed: (rate) => setSpeedById((prev) => ({ ...prev, [assistantId]: rate })),
    })

    streamingIdRef.current = null
    setStreaming(false)
    await reload()
  }

  const onStop = async () => {
    await inference.stop()
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {infoBanner ? (
        <Text
          style={[styles.banner, { color: colors.foreground, fontFamily: typography.bodyFamily }]}
          accessibilityRole="text"
        >
          {infoBanner}
        </Text>
      ) : null}
      {showOverBudgetBanner ? (
        <View style={[styles.overBudget, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text
            style={{ flex: 1, color: colors.foreground, fontFamily: typography.bodyFamily, fontSize: 13 }}
            accessibilityRole="alert"
          >
            {t('chat.overBudgetBanner')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.dismiss')}
            onPress={() => setOverBudgetDismissed(true)}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <Text style={{ color: colors.primary, fontFamily: typography.bodyMediumFamily }}>
              {t('chat.dismiss')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={visibleMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View>
            <MessageBubble
              role={item.role}
              content={item.content}
              status={item.status}
              provenance={
                item.role === 'assistant' && item.status === 'complete' && activeModel
                  ? (formatProvenance(
                      modelLabel,
                      speedById[item.id],
                      item.id === firstReplyId,
                    ) ?? undefined)
                  : undefined
              }
            />
            {item.status === 'error' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.retry')}
                onPress={() => void retryAssistant(item.id)}
                style={{ paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.primary, fontFamily: typography.bodyMediumFamily }}>
                  {t('chat.retry')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyLead, { color: colors.foreground }]}>
              {hasInstalledModel ? t('chat.emptyLead') : t('chat.noModelInstalled')}
            </Text>
            {hasInstalledModel ? (
              <Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>
                {t('chat.emptyNote', { name: modelLabel })}
              </Text>
            ) : null}
          </View>
        }
      />
      <Composer
        value={draft}
        onChangeText={setDraft}
        onSend={() => void send()}
        onStop={() => void onStop()}
        placeholder={t('chat.placeholder')}
        sendLabel={t('chat.send')}
        stopLabel={t('chat.stop')}
        disabled={!hasInstalledModel}
        streaming={streaming}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerTitle: { alignItems: 'center', justifyContent: 'center', minHeight: 44, maxWidth: 240 },
  headerName: {
    fontFamily: typography.headingFamily,
    fontSize: 16,
  },
  headerModel: {
    marginTop: 1,
    fontFamily: typography.bodyMediumFamily,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  empty: { paddingHorizontal: 24, paddingTop: 72, gap: 10 },
  emptyLead: {
    fontFamily: typography.headingFamily,
    fontSize: 22,
    lineHeight: 30,
  },
  emptyNote: {
    fontFamily: typography.bodyFamily,
    fontSize: 14,
    lineHeight: 21,
  },
  banner: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13 },
  overBudget: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
})
