import { useFocusEffect, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useRef, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { ConfirmSheet } from '@/src/components/ConfirmSheet'
import { EmptyState } from '@/src/components/EmptyState'
import { ModelRow } from '@/src/components/ModelRow'
import type { HubGgufFile, InstalledModel } from '@/src/domain/types'
import { t } from '@/src/i18n'
import { searchGgufModels } from '@/src/services/hfHub'
import {
  installFromHub,
  listInstalled,
  removeInstalled,
} from '@/src/services/modelStore'
import { loadHubCache, saveHubCache } from '@/src/services/preferences'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

function formatMb(bytes: number): string {
  return t('models.sizeMb', { n: Math.max(1, Math.round(bytes / (1024 * 1024))) })
}

export default function ModelsScreen() {
  const db = useSQLiteContext()
  const { colors } = useTheme()
  const router = useRouter()
  const [installed, setInstalled] = useState<InstalledModel[]>([])
  const [available, setAvailable] = useState<HubGgufFile[]>([])
  const [query, setQuery] = useState('')
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [offline, setOffline] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<InstalledModel | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshInstalled = useCallback(async () => {
    setInstalled(await listInstalled(db))
  }, [db])

  const loadHub = useCallback(async (q: string) => {
    try {
      const files = await searchGgufModels(q)
      setAvailable(files)
      setOffline(false)
      await saveHubCache(JSON.stringify(files))
    } catch {
      setOffline(true)
      const cached = await loadHubCache()
      if (cached) {
        try {
          setAvailable(JSON.parse(cached) as HubGgufFile[])
        } catch {
          setAvailable([])
        }
      } else {
        setAvailable([])
      }
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refreshInstalled()
      void loadHub('')
    }, [refreshInstalled, loadHub]),
  )

  const onSearch = (text: string) => {
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void loadHub(text)
    }, 300)
  }

  const installedIds = new Set(installed.map((m) => m.id))

  const startDownload = async (file: HubGgufFile) => {
    const id = `${file.repoId}/${file.filename}`
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setProgress((p) => ({ ...p, [id]: 0 }))
    try {
      await installFromHub(db, {
        repoId: file.repoId,
        filename: file.filename,
        displayName: file.displayName,
        sizeBytes: file.sizeBytes,
        signal: controller.signal,
        onProgress: (n) => setProgress((p) => ({ ...p, [id]: n })),
      })
      await refreshInstalled()
    } catch {
      // keep partial for resume
    } finally {
      setProgress((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <TextInput
        value={query}
        onChangeText={onSearch}
        placeholder={t('models.search')}
        placeholderTextColor={colors.border}
        style={[
          styles.search,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.muted,
            fontFamily: typography.bodyFamily,
            minHeight: 44,
          },
        ]}
      />
      {offline ? (
        <Text style={[styles.banner, { color: colors.foreground, fontFamily: typography.bodyFamily }]}>
          {t('models.offline')}
        </Text>
      ) : null}

      <FlatList
        data={[
          ...installed.map((m) => ({ kind: 'installed' as const, model: m })),
          ...available
            .filter((f) => !installedIds.has(`${f.repoId}/${f.filename}`))
            .map((f) => ({ kind: 'available' as const, file: f })),
        ]}
        keyExtractor={(item) =>
          item.kind === 'installed' ? `i:${item.model.id}` : `a:${item.file.repoId}/${item.file.filename}`
        }
        ListHeaderComponent={
          installed.length === 0 && available.length === 0 ? (
            <EmptyState
              title={t('tabs.models')}
              body={t('models.empty')}
              actionLabel={t('models.retry')}
              onAction={() => void loadHub(query)}
            />
          ) : (
            <Text
              style={[styles.section, { color: colors.foreground, fontFamily: typography.bodySemiBoldFamily }]}
            >
              {installed.length ? t('models.installed') : t('models.available')}
            </Text>
          )
        }
        renderItem={({ item }) => {
          if (item.kind === 'installed') {
            const m = item.model
            return (
              <ModelRow
                title={m.displayName}
                subtitle={formatMb(m.sizeBytes)}
                primaryLabel={t('chats.new')}
                onPrimary={() => router.push('/(tabs)')}
                secondaryLabel={t('models.delete')}
                onSecondary={() => setPendingDelete(m)}
              />
            )
          }
          const f = item.file
          const id = `${f.repoId}/${f.filename}`
          return (
            <ModelRow
              title={f.displayName}
              subtitle={formatMb(f.sizeBytes)}
              progress={progress[id] ?? null}
              primaryLabel={t('models.download')}
              onPrimary={() => void startDownload(f)}
            />
          )
        }}
      />

      <ConfirmSheet
        visible={!!pendingDelete}
        title={t('models.deleteTitle')}
        body={t('models.deleteBody')}
        confirmLabel={t('models.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) {
            void removeInstalled(db, target.id).then(refreshInstalled)
          }
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: {
    margin: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  banner: { paddingHorizontal: 16, marginBottom: 8, fontSize: 14 },
  section: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 14 },
})
