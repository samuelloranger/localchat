import AsyncStorage from '@react-native-async-storage/async-storage'

import type { LocalePreference } from '@/src/i18n'
import type { AppearancePreference } from '@/src/theme/ThemeProvider'

const KEYS = {
  appearance: 'prefs.appearance',
  locale: 'prefs.locale',
  hubCache: 'hub.cache.v1',
} as const

export async function loadAppearance(): Promise<AppearancePreference> {
  const v = await AsyncStorage.getItem(KEYS.appearance)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'system'
}

export async function saveAppearance(value: AppearancePreference): Promise<void> {
  await AsyncStorage.setItem(KEYS.appearance, value)
}

export async function loadLocale(): Promise<LocalePreference> {
  const v = await AsyncStorage.getItem(KEYS.locale)
  if (v === 'en' || v === 'fr' || v === 'system') return v
  return 'system'
}

export async function saveLocale(value: LocalePreference): Promise<void> {
  await AsyncStorage.setItem(KEYS.locale, value)
}

export async function loadHubCache(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.hubCache)
}

export async function saveHubCache(json: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.hubCache, json)
}
