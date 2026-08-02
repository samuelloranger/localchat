import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { SquarePen, Trash2 } from 'lucide-react-native'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native'

import { formatModelLabel } from '@/src/chat/modelLabel'
import { formatAge, RECENCY_ORDER, recencyBucket } from '@/src/chat/recency'
import { ConfirmSheet } from '@/src/components/ConfirmSheet'
import { EmptyState } from '@/src/components/EmptyState'
import type { Conversation, InstalledModel } from '@/src/domain/types'
import { useTranslation } from '@/src/i18n/LocaleProvider'
import * as chatStore from '@/src/services/chatStore'
import { listInstalled } from '@/src/services/modelStore'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

export default function ChatsScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const navigation = useNavigation()
  const { colors } = useTheme()
  const { t, activeLocale } = useTranslation()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [models, setModels] = useState<InstalledModel[]>([])
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)

  const hasModel = models.length > 0

  const refresh = useCallback(async () => {
    const [list, installed] = await Promise.all([
      chatStore.listConversations(db),
      listInstalled(db),
    ])
    setConversations(list)
    setModels(installed)
  }, [db])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  const onNew = useCallback(async () => {
    const installed = await listInstalled(db)
    if (!installed.length) {
      router.push('/(tabs)/models')
      return
    }
    const preferred = [...installed].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0]
    const c = await chatStore.createConversation(db, {
      modelId: preferred.id,
      title: t('chats.new'),
    })
    router.push(`/chat/${c.id}`)
  }, [db, router, t])

  // A compose glyph in the header rather than a full-width slab above the list:
  // the action is permanent, the list is the content, and the slab was the
  // loudest thing on a screen it does not belong to.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chats.new')}
          disabled={!hasModel}
          onPress={() => void onNew()}
          style={({ pressed }) => [
            styles.headerAction,
            { opacity: !hasModel ? 0.35 : pressed ? 0.6 : 1 },
          ]}
        >
          <SquarePen size={21} color={colors.primary} strokeWidth={2} />
        </Pressable>
      ),
    })
  }, [navigation, t, hasModel, onNew, colors.primary])

  const modelLabelFor = useCallback(
    (modelId: string) => {
      const model = models.find((m) => m.id === modelId)
      return model ? formatModelLabel(model.displayName) : null
    },
    [models],
  )

  // Grouped by recency because that is how a history is actually navigated —
  // "the one from this morning", not "the fourteenth one down".
  const sections = useMemo(() => {
    const now = Date.now()
    const byBucket = new Map<string, Conversation[]>()
    for (const c of conversations) {
      const bucket = recencyBucket(c.updatedAt, now)
      const list = byBucket.get(bucket)
      if (list) list.push(c)
      else byBucket.set(bucket, [c])
    }
    return RECENCY_ORDER.filter((bucket) => byBucket.has(bucket)).map((bucket) => ({
      title: t(`chats.bucket.${bucket}`),
      data: byBucket.get(bucket) ?? [],
    }))
  }, [conversations, t])

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={conversations.length ? undefined : styles.emptyContainer}
        renderSectionHeader={({ section: { title } }) => (
          <View style={[styles.sectionWrap, { backgroundColor: colors.background }]}>
            <Text style={[styles.section, { color: colors.mutedForeground }]}>{title}</Text>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            title={hasModel ? t('chats.emptyTitle') : t('chats.emptyNeedModelTitle')}
            body={hasModel ? t('chats.empty') : t('chats.emptyNeedModel')}
            actionLabel={hasModel ? t('chats.new') : t('chats.goModels')}
            onAction={() => {
              if (hasModel) void onNew()
              else router.push('/(tabs)/models')
            }}
          />
        }
        renderItem={({ item }) => {
          const model = modelLabelFor(item.modelId)
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityActions={[{ name: 'delete', label: t('chats.deleteConfirm') }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'delete') setPendingDelete(item)
              }}
              onPress={() => router.push(`/chat/${item.id}`)}
              onLongPress={() => setPendingDelete(item)}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={styles.rowBody}>
                <Text
                  numberOfLines={1}
                  style={[styles.rowTitle, { color: colors.foreground }]}
                >
                  {item.title}
                </Text>
                {model ? (
                  <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                    {model}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.rowAge, { color: colors.mutedForeground }]}>
                {formatAge(item.updatedAt, Date.now(), activeLocale)}
              </Text>
              {/* Long-press is invisible to anyone who has not been told about
                  it, so the destructive action gets a visible target too. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chats.deleteConfirm')}
                onPress={() => setPendingDelete(item)}
                hitSlop={8}
                style={({ pressed }) => [styles.rowDelete, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Trash2 size={16} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            </Pressable>
          )
        }}
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
  headerAction: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  emptyContainer: { flexGrow: 1 },
  // Sticky headers float over the list, so they need an opaque background or
  // the first row of the section scrolls underneath them.
  sectionWrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  section: {
    fontFamily: typography.bodySemiBoldFamily,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: typography.bodySemiBoldFamily, fontSize: 16, lineHeight: 21 },
  rowMeta: { fontFamily: typography.bodyFamily, fontSize: 12.5 },
  rowAge: { fontFamily: typography.bodyMediumFamily, fontSize: 12 },
  rowDelete: { width: 28, alignItems: 'flex-end', justifyContent: 'center' },
})
