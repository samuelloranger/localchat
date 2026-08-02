import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSQLiteContext } from 'expo-sqlite'

import { useTranslation } from '@/src/i18n/LocaleProvider'
import type { LocalePreference } from '@/src/i18n'
import { ConfirmSheet } from '@/src/components/ConfirmSheet'
import {
  clearIncompleteDownloads,
  deleteAllAppData,
  getModelsStorageBytes,
} from '@/src/services/storageAdmin'
import {
  useTheme,
  type AppearancePreference,
} from '@/src/theme/ThemeProvider'
import { saveAppearance } from '@/src/services/preferences'
import { typography } from '@/src/theme/typography'

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.block}>
      <Text style={[styles.label, { color: colors.foreground, fontFamily: typography.bodySemiBoldFamily }]}>
        {label}
      </Text>
      <View style={styles.choices}>
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(opt.value)}
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
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export default function SettingsScreen() {
  const db = useSQLiteContext()
  const { colors, appearance, setAppearance } = useTheme()
  const { locale, setLocalePreference, t } = useTranslation()
  const [storageMb, setStorageMb] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  const refreshStorage = async () => {
    const bytes = await getModelsStorageBytes()
    setStorageMb(Math.round(bytes / (1024 * 1024)))
  }

  useEffect(() => {
    void refreshStorage()
  }, [])

  const onAppearance = async (value: AppearancePreference) => {
    setAppearance(value)
    await saveAppearance(value)
  }

  const onLocale = async (value: LocalePreference) => {
    await setLocalePreference(value)
  }

  const onClearIncomplete = async () => {
    await clearIncompleteDownloads()
    await refreshStorage()
    setStatusMessage(t('settings.clearIncompleteDone'))
  }

  const onDeleteAll = async () => {
    await deleteAllAppData(db)
    setConfirmDeleteAll(false)
    await refreshStorage()
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ChoiceRow
        label={t('settings.appearance')}
        value={appearance}
        onChange={(v) => void onAppearance(v)}
        options={[
          { value: 'system', label: t('settings.system') },
          { value: 'light', label: t('settings.light') },
          { value: 'dark', label: t('settings.dark') },
        ]}
      />
      <ChoiceRow
        label={t('settings.language')}
        value={locale}
        onChange={(v) => void onLocale(v)}
        options={[
          { value: 'system', label: t('settings.system') },
          { value: 'en', label: t('settings.english') },
          { value: 'fr', label: t('settings.french') },
        ]}
      />
      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.foreground, fontFamily: typography.bodySemiBoldFamily }]}>
          {t('settings.storage')}
        </Text>
        <Text style={{ color: colors.foreground, fontFamily: typography.bodyFamily, fontSize: 16 }}>
          {t('settings.storageUsed', { n: storageMb })}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void onClearIncomplete()}
          style={({ pressed }) => [
            styles.actionBtn,
            { borderColor: colors.border, opacity: pressed ? 0.85 : 1, minHeight: 44 },
          ]}
        >
          <Text style={{ color: colors.primary, fontFamily: typography.bodyMediumFamily }}>
            {t('settings.clearIncomplete')}
          </Text>
        </Pressable>
        {statusMessage ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: typography.bodyFamily, fontSize: 14 }}>
            {statusMessage}
          </Text>
        ) : null}
      </View>
      <View style={styles.block}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmDeleteAll(true)}
          style={({ pressed }) => [
            styles.actionBtn,
            { borderColor: colors.destructive, opacity: pressed ? 0.85 : 1, minHeight: 44 },
          ]}
        >
          <Text style={{ color: colors.destructive, fontFamily: typography.bodyMediumFamily }}>
            {t('settings.deleteAllData')}
          </Text>
        </Pressable>
      </View>
      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.foreground, fontFamily: typography.bodySemiBoldFamily }]}>
          {t('settings.about')}
        </Text>
        <Text style={{ color: colors.foreground, fontFamily: typography.bodyFamily, fontSize: 16, lineHeight: 24 }}>
          {t('settings.privacy')}
        </Text>
      </View>

      <ConfirmSheet
        visible={confirmDeleteAll}
        title={t('settings.deleteAllTitle')}
        body={t('settings.deleteAllBody')}
        confirmLabel={t('settings.deleteAllConfirm')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmDeleteAll(false)}
        onConfirm={() => void onDeleteAll()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, padding: 16, gap: 20 },
  block: { gap: 10 },
  label: { fontSize: 16 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  actionBtn: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
})
