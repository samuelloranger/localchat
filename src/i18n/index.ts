import { getLocales } from 'expo-localization'
import { I18n } from 'i18n-js'

import en from './en'
import fr from './fr'

export type LocalePreference = 'system' | 'en' | 'fr'

const i18n = new I18n({ en, fr })
i18n.defaultLocale = 'en'
i18n.enableFallback = true
i18n.locale = resolveSystemLocale()

function resolveSystemLocale(): 'en' | 'fr' {
  const code = getLocales()[0]?.languageCode?.toLowerCase()
  return code === 'fr' ? 'fr' : 'en'
}

export function setLocale(preference: LocalePreference): void {
  if (preference === 'system') {
    i18n.locale = resolveSystemLocale()
    return
  }
  i18n.locale = preference
}

export function t(key: string, opts?: Record<string, string | number>): string {
  return i18n.t(key, opts)
}

export function getLocale(): string {
  return i18n.locale
}
