import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[styles.sectionBody, { borderTopColor: colors.border }]}>{children}</View>
    </View>
  )
}

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
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
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
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Section title={t('settings.sectionAppearance')}>
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
      </Section>

      <Section title={t('settings.storage')}>
        <View style={styles.block}>
          {/* The figure is the content here, so it is set at display size
              rather than buried in a sentence. */}
          <Text style={[styles.figure, { color: colors.foreground }]}>
            {t('settings.storageUsed', { n: storageMb })}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void onClearIncomplete()}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {t('settings.clearIncomplete')}
            </Text>
          </Pressable>
          {statusMessage ? (
            <Text
              style={[styles.note, { color: colors.mutedForeground }]}
              accessibilityRole="alert"
            >
              {statusMessage}
            </Text>
          ) : null}
        </View>
      </Section>

      <Section title={t('settings.about')}>
        <Text style={[styles.thesis, { color: colors.foreground }]}>{t('settings.privacy')}</Text>
      </Section>

      {/* Irreversible, so it does not sit at the same weight as maintenance:
          its own section at the end, in the destructive colour, behind a
          confirmation. */}
      <Section title={t('settings.sectionDanger')}>
        <View style={styles.block}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmDeleteAll(true)}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: colors.destructive, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.actionText, { color: colors.destructive }]}>
              {t('settings.deleteAllData')}
            </Text>
          </Pressable>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            {t('settings.deleteAllNote')}
          </Text>
        </View>
      </Section>

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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 26 },
  section: { gap: 10 },
  sectionTitle: {
    fontFamily: typography.bodySemiBoldFamily,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionBody: { gap: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  block: { gap: 10, alignItems: 'flex-start' },
  label: { fontFamily: typography.bodySemiBoldFamily, fontSize: 15 },
  figure: { fontFamily: typography.headingFamily, fontSize: 26 },
  note: { fontFamily: typography.bodyFamily, fontSize: 13, lineHeight: 19 },
  thesis: { fontFamily: typography.bodyFamily, fontSize: 15, lineHeight: 23 },
  actionText: { fontFamily: typography.bodyMediumFamily, fontSize: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  actionBtn: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
})
