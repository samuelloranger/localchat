import { useFocusEffect, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Pressable,
  ScrollView,
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
import {
  formatGiB,
  getDeviceRamBytes,
} from '@/src/services/deviceCapability'
import { searchGgufModels } from '@/src/services/hfHub'
import {
  applyModelFilters,
  fitForFile,
  sortModels,
  type ModelSortKey,
  type QuantFamily,
} from '@/src/services/modelCatalog'
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
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.muted,
          borderColor: colors.border,
          minHeight: 36,
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
  const [installed, setInstalled] = useState<InstalledModel[]>([])
  const [available, setAvailable] = useState<HubGgufFile[]>([])
  const [query, setQuery] = useState('')
  const [localQuery, setLocalQuery] = useState('')
  const [quant, setQuant] = useState<QuantFamily | 'any'>('any')
  const [maxSize, setMaxSize] = useState<number | null>(null)
  const [fitsOnly, setFitsOnly] = useState(false)
  const [sort, setSort] = useState<ModelSortKey>('downloads')
  const [deviceRam] = useState(() => getDeviceRamBytes())
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
      void loadHub(query)
    }, [refreshInstalled, loadHub, query]),
  )

  const onSearch = (text: string) => {
    setLocalQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setQuery(text)
      void loadHub(text)
    }, 300)
  }

  const filteredAvailable = useMemo(() => {
    const installedIdSet = new Set(installed.map((m) => m.id))
    const filtered = applyModelFilters(
      available.filter((f) => !installedIdSet.has(`${f.repoId}/${f.filename}`)),
      {
        query: localQuery,
        quant,
        maxSizeBytes: maxSize ?? undefined,
        fitsDeviceOnly: fitsOnly,
      },
      deviceRam,
    )
    return sortModels(filtered, sort)
  }, [available, installed, localQuery, quant, maxSize, fitsOnly, deviceRam, sort])

  const startDownload = async (file: HubGgufFile) => {
    const fit = fitForFile(file, deviceRam)
    if (!fit.fits) return

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

  const unfitWarning = (sizeBytes: number) => {
    const fit = fitForFile({ repoId: '', filename: '', displayName: '', sizeBytes }, deviceRam)
    if (fit.fits) return undefined
    return t('models.unfitRam', {
      need: formatGiB(fit.estimatedRamBytes),
      have: formatGiB(fit.deviceRamBytes),
    })
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <TextInput
        value={localQuery}
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

      <Text style={[styles.deviceLine, { color: colors.foreground, fontFamily: typography.bodyFamily }]}>
        {t('models.deviceRam', { n: formatGiB(deviceRam) })}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={t('models.fitsDevice')} active={fitsOnly} onPress={() => setFitsOnly((v) => !v)} />
        {QUANT_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={t(opt.labelKey)}
            active={quant === opt.value}
            onPress={() => setQuant(opt.value)}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SIZE_OPTIONS.map((opt) => (
          <Chip
            key={opt.labelKey}
            label={t(opt.labelKey)}
            active={maxSize === opt.value}
            onPress={() => setMaxSize(opt.value)}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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
        <Text style={[styles.banner, { color: colors.foreground, fontFamily: typography.bodyFamily }]}>
          {t('models.offline')}
        </Text>
      ) : null}

      <FlatList
        data={[
          ...installed.map((m) => ({ kind: 'installed' as const, model: m })),
          ...filteredAvailable.map((f) => ({ kind: 'available' as const, file: f })),
        ]}
        keyExtractor={(item) =>
          item.kind === 'installed' ? `i:${item.model.id}` : `a:${item.file.repoId}/${item.file.filename}`
        }
        ListHeaderComponent={
          installed.length === 0 && filteredAvailable.length === 0 ? (
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
            const warning = unfitWarning(m.sizeBytes)
            return (
              <ModelRow
                title={m.displayName}
                subtitle={`${formatMb(m.sizeBytes)} · ~${formatGiB(fitForFile({ ...m, repoId: m.repoId, filename: m.filename, displayName: m.displayName }, deviceRam).estimatedRamBytes)} GB RAM`}
                primaryLabel={t('chats.new')}
                onPrimary={() => {
                  if (warning) return
                  router.push('/(tabs)')
                }}
                secondaryLabel={t('models.delete')}
                onSecondary={() => setPendingDelete(m)}
                unfit={!!warning}
                warning={warning}
              />
            )
          }
          const f = item.file
          const id = `${f.repoId}/${f.filename}`
          const fit = fitForFile(f, deviceRam)
          const warning = unfitWarning(f.sizeBytes)
          const quantLabel = f.quant ?? 'GGUF'
          return (
            <ModelRow
              title={f.displayName}
              subtitle={`${quantLabel} · ${formatMb(f.sizeBytes)} · ~${formatGiB(fit.estimatedRamBytes)} GB RAM${
                typeof f.downloads === 'number' ? ` · ${f.downloads.toLocaleString()}↓` : ''
              }`}
              progress={progress[id] ?? null}
              primaryLabel={t('models.download')}
              onPrimary={() => void startDownload(f)}
              unfit={!fit.fits}
              warning={warning}
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
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  deviceLine: { paddingHorizontal: 16, marginBottom: 8, fontSize: 13, opacity: 0.75 },
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
