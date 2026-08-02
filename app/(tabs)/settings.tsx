import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSQLiteContext } from 'expo-sqlite'

import { t, setLocale, type LocalePreference } from '@/src/i18n'
import { listInstalled } from '@/src/services/modelStore'
import {
  loadAppearance,
  loadLocale,
  saveAppearance,
  saveLocale,
} from '@/src/services/preferences'
import {
  useTheme,
  type AppearancePreference,
} from '@/src/theme/ThemeProvider'
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
  const [locale, setLocaleState] = useState<LocalePreference>('system')
  const [storageMb, setStorageMb] = useState(0)
  const [, bump] = useState(0)

  useEffect(() => {
    void (async () => {
      const [a, l, models] = await Promise.all([loadAppearance(), loadLocale(), listInstalled(db)])
      setAppearance(a)
      setLocaleState(l)
      setLocale(l)
      const bytes = models.reduce((sum, m) => sum + m.sizeBytes, 0)
      setStorageMb(Math.round(bytes / (1024 * 1024)))
    })()
  }, [db, setAppearance])

  const onAppearance = async (value: AppearancePreference) => {
    setAppearance(value)
    await saveAppearance(value)
  }

  const onLocale = async (value: LocalePreference) => {
    setLocaleState(value)
    setLocale(value)
    await saveLocale(value)
    bump((n) => n + 1)
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
      </View>
      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.foreground, fontFamily: typography.bodySemiBoldFamily }]}>
          {t('settings.about')}
        </Text>
        <Text style={{ color: colors.foreground, fontFamily: typography.bodyFamily, fontSize: 16, lineHeight: 24 }}>
          {t('settings.privacy')}
        </Text>
      </View>
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
})
