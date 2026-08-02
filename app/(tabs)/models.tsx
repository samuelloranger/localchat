import { useFocusEffect, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { ConfirmSheet } from '@/src/components/ConfirmSheet'
import { EmptyState } from '@/src/components/EmptyState'
import { ModelRow } from '@/src/components/ModelRow'
import type { HubGgufFile, InstalledModel } from '@/src/domain/types'
import { useDeviceRam } from '@/src/hooks/useDeviceRam'
import { useTranslation } from '@/src/i18n/LocaleProvider'
import { DownloadError, DownloadErrorCode } from '@/src/services/downloadManager'
import {
  evaluateModelFit,
  formatGiB,
} from '@/src/services/deviceCapability'
import { searchGgufModels } from '@/src/services/hfHub'
import {
  applyModelFilters,
  parseQuantFamily,
  sortModels,
  type ModelSortKey,
  type QuantFamily,
} from '@/src/services/modelCatalog'
import * as chatStore from '@/src/services/chatStore'
import {
  installFromHub,
  listInstalled,
  removeInstalled,
} from '@/src/services/modelStore'
import { loadHubCache, saveHubCache } from '@/src/services/preferences'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

const QUANT_OPTIONS: Array<{ value: QuantFamily | 'any'; labelKey: string }> = [
  { value: 'any', labelKey: 'models.quantAny' },
  { value: 'Q4', labelKey: 'models.quantQ4' },
  { value: 'Q5', labelKey: 'models.quantQ5' },
  { value: 'Q8', labelKey: 'models.quantQ8' },
  { value: 'IQ', labelKey: 'models.quantIq' },
]

const SORT_OPTIONS: Array<{ value: ModelSortKey; labelKey: string }> = [
  { value: 'downloads', labelKey: 'models.sortDownloads' },
  { value: 'sizeAsc', labelKey: 'models.sortSizeAsc' },
  { value: 'sizeDesc', labelKey: 'models.sortSizeDesc' },
  { value: 'name', labelKey: 'models.sortName' },
  { value: 'updated', labelKey: 'models.sortUpdated' },
]

const SIZE_OPTIONS: Array<{ value: number | null; labelKey: string }> = [
  { value: null, labelKey: 'models.sizeAny' },
  { value: 500 * 1024 * 1024, labelKey: 'models.sizeUnder500' },
  { value: 1024 * 1024 * 1024, labelKey: 'models.sizeUnder1g' },
  { value: 2 * 1024 * 1024 * 1024, labelKey: 'models.sizeUnder2g' },
  { value: 4 * 1024 * 1024 * 1024, labelKey: 'models.sizeUnder4g' },
]

function hubFileId(file: HubGgufFile): string {
  return `${file.repoId}/${file.filename}`
}

function downloadErrorMessage(err: unknown, t: (key: string) => string): string {
  if (err instanceof DownloadError) {
    switch (err.code) {
      case DownloadErrorCode.INCOMPLETE:
        return t('models.downloadErrorIncomplete')
      case DownloadErrorCode.NOT_GGUF:
        return t('models.downloadErrorNotFound')
      case DownloadErrorCode.ABORTED:
        return ''
      case DownloadErrorCode.FAILED:
      default:
        break
    }
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  if (msg.includes('storage') || msg.includes('space') || msg.includes('enospc')) {
    return t('models.downloadErrorStorage')
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
    return t('models.downloadErrorNetwork')
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return t('models.downloadErrorNotFound')
  }
  return t('models.downloadErrorGeneric')
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.muted,
          borderColor: colors.border,
          minHeight: 44,
        },
      ]}
    >
      <Text
        style={{
          color: active ? colors.onPrimary : colors.foreground,
          fontFamily: typography.bodyMediumFamily,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export default function ModelsScreen() {
  const db = useSQLiteContext()
  const { colors } = useTheme()
  const router = useRouter()
  const { t, activeLocale } = useTranslation()
  const deviceRam = useDeviceRam()
  const [installed, setInstalled] = useState<InstalledModel[]>([])
  const [available, setAvailable] = useState<HubGgufFile[]>([])
  const [localQuery, setLocalQuery] = useState('')
  const [hubQuery, setHubQuery] = useState('')
  const [serverFiltered, setServerFiltered] = useState(false)
  const [quant, setQuant] = useState<QuantFamily | 'any'>('any')
  const [maxSize, setMaxSize] = useState<number | null>(null)
  const [fitsOnly, setFitsOnly] = useState(false)
  const [sort, setSort] = useState<ModelSortKey>('downloads')
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({})
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [hubEmpty, setHubEmpty] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<InstalledModel | null>(null)
  const [pendingDownload, setPendingDownload] = useState<HubGgufFile | null>(null)
  const searchSeqRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hubAbortRef = useRef<AbortController | null>(null)

  const ramUnit = t('models.ramUnit')

  const formatMb = useCallback(
    (bytes: number) => t('models.sizeMb', { n: Math.max(1, Math.round(bytes / (1024 * 1024))) }),
    [t],
  )

  const formatRamEstimate = useCallback(
    (bytes: number) => t('models.estimatedRam', { n: formatGiB(bytes), unit: ramUnit }),
    [t, ramUnit],
  )

  const formatSubtitle = useCallback(
    (file: HubGgufFile, fit: ReturnType<typeof evaluateModelFit>) => {
      const quantLabel = file.quant ?? 'GGUF'
      const ram = formatRamEstimate(fit.estimatedRamBytes)
      const size = formatMb(file.sizeBytes)
      if (typeof file.downloads === 'number') {
        return t('models.subtitleDownloads', {
          quant: quantLabel,
          size,
          ram,
          downloads: file.downloads.toLocaleString(activeLocale),
        })
      }
      return t('models.subtitle', { quant: quantLabel, size, ram })
    },
    [t, formatMb, formatRamEstimate, activeLocale],
  )

  const unfitWarning = useCallback(
    (sizeBytes: number) => {
      const fit = evaluateModelFit(sizeBytes, deviceRam)
      if (fit.fits) return undefined
      // Compare against usable budget (jetsam / OS headroom), not total RAM —
      // showing deviceRamBytes here made "needs 4.6 / has 5.5" look absurd.
      return t('models.unfitRam', {
        need: formatGiB(fit.estimatedRamBytes),
        have: formatGiB(fit.usableRamBytes),
        unit: ramUnit,
      })
    },
    [deviceRam, t, ramUnit],
  )

  const refreshInstalled = useCallback(async () => {
    setInstalled(await listInstalled(db))
  }, [db])

  const loadHub = useCallback(async (q: string) => {
    const seq = ++searchSeqRef.current
    hubAbortRef.current?.abort()
    const controller = new AbortController()
    hubAbortRef.current = controller

    try {
      const files = await searchGgufModels(q, { signal: controller.signal })
      if (seq !== searchSeqRef.current) return
      setAvailable(files)
      setOffline(false)
      setHubEmpty(files.length === 0 && q.trim().length > 0)
      setServerFiltered(q.trim().length > 0)
      setHubQuery(q)
      await saveHubCache(JSON.stringify(files))
    } catch (err) {
      if (seq !== searchSeqRef.current) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      setOffline(true)
      setHubEmpty(false)
      const cached = await loadHubCache()
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as HubGgufFile[]
          if (seq !== searchSeqRef.current) return
          setAvailable(parsed)
          setHubEmpty(parsed.length === 0)
          setServerFiltered(false)
        } catch {
          setAvailable([])
          setHubEmpty(true)
        }
      } else {
        setAvailable([])
        setHubEmpty(true)
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
    setLocalQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void loadHub(text)
    }, 300)
  }

  const hasLocalFilters = quant !== 'any' || maxSize !== null || fitsOnly

  const filteredAvailable = useMemo(() => {
    const installedIdSet = new Set(installed.map((m) => m.id))
    const filtered = applyModelFilters(
      available.filter((f) => !installedIdSet.has(hubFileId(f))),
      {
        query: serverFiltered ? undefined : localQuery,
        quant,
        maxSizeBytes: maxSize ?? undefined,
        fitsDeviceOnly: fitsOnly,
      },
      deviceRam,
    )
    return sortModels(filtered, sort)
  }, [available, installed, localQuery, serverFiltered, quant, maxSize, fitsOnly, deviceRam, sort])

  const clearFilters = () => {
    setQuant('any')
    setMaxSize(null)
    setFitsOnly(false)
  }

  const runDownload = async (file: HubGgufFile) => {
    const id = hubFileId(file)
    if (activeDownloadId && activeDownloadId !== id) return

    setActiveDownloadId(id)
    setDownloadErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setProgress((p) => ({ ...p, [id]: 0 }))

    try {
      await installFromHub(db, {
        repoId: file.repoId,
        filename: file.filename,
        displayName: file.displayName,
        sizeBytes: file.sizeBytes,
        onProgress: (n) => setProgress((p) => ({ ...p, [id]: n })),
      })
      await refreshInstalled()
      setDownloadErrors((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch (err) {
      const message = downloadErrorMessage(err, t)
      if (message) {
        setDownloadErrors((prev) => ({ ...prev, [id]: message }))
      }
    } finally {
      setProgress((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
      setActiveDownloadId(null)
    }
  }

  const requestDownload = (file: HubGgufFile) => {
    if (activeDownloadId) return
    const fit = evaluateModelFit(file.sizeBytes, deviceRam)
    if (!fit.fits) {
      setPendingDownload(file)
      return
    }
    void runDownload(file)
  }

  const onNewChat = async (model: InstalledModel) => {
    const c = await chatStore.createConversation(db, {
      modelId: model.id,
      title: t('chats.new'),
    })
    router.push(`/chat/${c.id}`)
  }

  const sections = useMemo(() => {
    const result: Array<{ title: string; data: Array<{ kind: 'installed'; model: InstalledModel } | { kind: 'available'; file: HubGgufFile }> }> = []
    if (installed.length) {
      result.push({
        title: t('models.installed'),
        data: installed.map((model) => ({ kind: 'installed' as const, model })),
      })
    }
    if (filteredAvailable.length) {
      result.push({
        title: t('models.available'),
        data: filteredAvailable.map((file) => ({ kind: 'available' as const, file })),
      })
    }
    return result
  }, [installed, filteredAvailable, t])

  const listEmpty = () => {
    if (offline && available.length === 0) {
      return (
        <EmptyState
          title={t('tabs.models')}
          body={t('models.emptyOffline')}
          actionLabel={t('models.retry')}
          onAction={() => void loadHub(localQuery)}
        />
      )
    }
    if (hubEmpty && !hasLocalFilters) {
      return (
        <EmptyState
          title={t('tabs.models')}
          body={t('models.emptyNoHub')}
          actionLabel={t('models.retry')}
          onAction={() => void loadHub(localQuery)}
        />
      )
    }
    if (hasLocalFilters && filteredAvailable.length === 0) {
      return (
        <EmptyState
          title={t('tabs.models')}
          body={t('models.emptyNoFilters')}
          actionLabel={t('models.clearFilters')}
          onAction={clearFilters}
        />
      )
    }
    if (installed.length === 0 && filteredAvailable.length === 0) {
      return (
        <EmptyState
          title={t('tabs.models')}
          body={t('models.empty')}
          actionLabel={t('models.retry')}
          onAction={() => void loadHub(hubQuery)}
        />
      )
    }
    return null
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <TextInput
        value={localQuery}
        onChangeText={onSearch}
        placeholder={t('models.search')}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={t('models.search')}
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

      <Text style={[styles.deviceLine, { color: colors.mutedForeground, fontFamily: typography.bodyFamily }]}>
        {t('models.deviceRam', { n: formatGiB(deviceRam), unit: ramUnit })}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipBar}
        contentContainerStyle={styles.chips}
      >
        <Chip label={t('models.fitsDevice')} active={fitsOnly} onPress={() => setFitsOnly((v) => !v)} />
        {QUANT_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={t(opt.labelKey)}
            active={quant === opt.value}
            onPress={() => setQuant(opt.value)}
          />
        ))}
        {SIZE_OPTIONS.map((opt) => (
          <Chip
            key={opt.labelKey}
            label={t(opt.labelKey)}
            active={maxSize === opt.value}
            onPress={() => setMaxSize(opt.value)}
          />
        ))}
        {SORT_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={t(opt.labelKey)}
            active={sort === opt.value}
            onPress={() => setSort(opt.value)}
          />
        ))}
      </ScrollView>

      {offline ? (
        <Text
          style={[styles.banner, { color: colors.foreground, fontFamily: typography.bodyFamily }]}
          accessibilityRole="alert"
        >
          {t('models.offline')}
        </Text>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) =>
          item.kind === 'installed' ? `i:${item.model.id}` : `a:${hubFileId(item.file)}`
        }
        renderSectionHeader={({ section: { title } }) => (
          <Text
            style={[styles.section, { color: colors.foreground, fontFamily: typography.bodySemiBoldFamily }]}
          >
            {title}
          </Text>
        )}
        ListEmptyComponent={listEmpty()}
        ListFooterComponent={
          hasLocalFilters && filteredAvailable.length === 0 && installed.length > 0 ? (
            <EmptyState
              title={t('tabs.models')}
              body={t('models.emptyNoFilters')}
              actionLabel={t('models.clearFilters')}
              onAction={clearFilters}
            />
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === 'installed') {
            const m = item.model
            const fit = evaluateModelFit(m.sizeBytes, deviceRam)
            const warning = unfitWarning(m.sizeBytes)
            const subtitle = formatSubtitle(
              {
                repoId: m.repoId,
                filename: m.filename,
                displayName: m.displayName,
                sizeBytes: m.sizeBytes,
                quant: parseQuantFamily(m.filename),
              },
              fit,
            )
            return (
              <ModelRow
                title={m.displayName}
                subtitle={subtitle}
                primaryLabel={t('chats.new')}
                onPrimary={() => void onNewChat(m)}
                secondaryLabel={t('models.delete')}
                onSecondary={() => setPendingDelete(m)}
                unfit={!!warning}
                warning={warning}
              />
            )
          }
          const f = item.file
          const id = hubFileId(f)
          const fit = evaluateModelFit(f.sizeBytes, deviceRam)
          const warning = unfitWarning(f.sizeBytes)
          return (
            <ModelRow
              title={f.displayName}
              subtitle={formatSubtitle(f, fit)}
              accessibilityHint={
                typeof f.downloads === 'number'
                  ? t('models.downloadsCount', { n: f.downloads.toLocaleString(activeLocale) })
                  : undefined
              }
              progress={progress[id] ?? null}
              primaryLabel={t('models.download')}
              onPrimary={() => requestDownload(f)}
              blockPrimary={!!activeDownloadId && activeDownloadId !== id}
              unfit={!fit.fits}
              warning={warning}
              downloadError={downloadErrors[id]}
              onRetryDownload={() => void runDownload(f)}
              retryLabel={t('models.retry')}
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

      <ConfirmSheet
        visible={!!pendingDownload}
        title={t('models.downloadAnywayTitle')}
        body={t('models.downloadAnywayBody')}
        confirmLabel={t('models.download')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          const file = pendingDownload
          setPendingDownload(null)
          if (file) void runDownload(file)
        }}
        onCancel={() => setPendingDownload(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  deviceLine: { paddingHorizontal: 16, marginBottom: 8, fontSize: 13 },
  // A horizontal ScrollView inside a flex column stretches to fill the leftover
  // vertical space. flexGrow: 0 pins it to its content height — without it the
  // chip row centres itself in a full-screen-tall box and pushes the list down.
  chipBar: { flexGrow: 0, flexShrink: 0 },
  chips: { paddingHorizontal: 16, paddingBottom: 8, gap: 8, alignItems: 'center' },
  chip: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  banner: { paddingHorizontal: 16, marginBottom: 8, fontSize: 14 },
  section: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 14 },
})
