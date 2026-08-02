import { useFocusEffect, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { ConfirmSheet } from '@/src/components/ConfirmSheet'
import { EmptyState } from '@/src/components/EmptyState'
import type { Conversation } from '@/src/domain/types'
import { t } from '@/src/i18n'
import * as chatStore from '@/src/services/chatStore'
import { evaluateModelFit } from '@/src/services/deviceCapability'
import { listInstalled } from '@/src/services/modelStore'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

export default function ChatsScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const { colors } = useTheme()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [hasModel, setHasModel] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)

  const refresh = useCallback(async () => {
    const [list, models] = await Promise.all([chatStore.listConversations(db), listInstalled(db)])
    setConversations(list)
    setHasModel(models.some((m) => evaluateModelFit(m.sizeBytes).fits))
  }, [db])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  const onNew = async () => {
    const models = await listInstalled(db)
    const runnable = models.filter((m) => evaluateModelFit(m.sizeBytes).fits)
    if (!runnable.length) {
      router.push('/(tabs)/models')
      return
    }
    const preferred = [...runnable].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0]
    const c = await chatStore.createConversation(db, {
      modelId: preferred.id,
      title: t('chats.new'),
    })
    router.push(`/chat/${c.id}`)
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          disabled={!hasModel}
          onPress={() => void onNew()}
          style={({ pressed }) => [
            styles.newBtn,
            {
              backgroundColor: colors.primary,
              opacity: !hasModel ? 0.4 : pressed ? 0.85 : 1,
              minHeight: 44,
            },
          ]}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: typography.bodySemiBoldFamily }}>
            {t('chats.new')}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            title={t('tabs.chats')}
            body={hasModel ? t('chats.empty') : t('chats.emptyNeedModel')}
            actionLabel={hasModel ? t('chats.new') : t('chats.goModels')}
            onAction={() => {
              if (hasModel) void onNew()
              else router.push('/(tabs)/models')
            }}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/chat/${item.id}`)}
            onLongPress={() => setPendingDelete(item)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.border, opacity: pressed ? 0.85 : 1, minHeight: 56 },
            ]}
          >
            <Text
              style={{ color: colors.foreground, fontFamily: typography.bodySemiBoldFamily, fontSize: 16 }}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          </Pressable>
        )}
      />

      <ConfirmSheet
        visible={!!pendingDelete}
        title={t('chats.deleteTitle')}
        body={t('chats.deleteBody')}
        confirmLabel={t('chats.deleteConfirm')}
        cancelLabel={t('chats.cancel')}
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) {
            void chatStore.deleteConversation(db, target.id).then(refresh)
          }
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: 16 },
  newBtn: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
})
