import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { loadLocale, saveLocale } from '@/src/services/preferences'

import { getLocale, setLocale, t as translate, type LocalePreference } from './index'

type LocaleContextValue = {
  locale: LocalePreference
  activeLocale: string
  setLocalePreference: (pref: LocalePreference) => Promise<void>
  t: typeof translate
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

type Props = {
  children: ReactNode
  /** When provided, skips async load (bootstrap already loaded prefs). */
  initialLocale?: LocalePreference
  onReady?: () => void
}

export function LocaleProvider({ children, initialLocale, onReady }: Props) {
  const [locale, setLocaleState] = useState<LocalePreference>(() => {
    const pref = initialLocale ?? 'system'
    setLocale(pref)
    return pref
  })
  const [ready, setReady] = useState(initialLocale !== undefined)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (initialLocale !== undefined) {
      setReady(true)
      onReady?.()
      return
    }
    void loadLocale().then((loaded) => {
      setLocaleState(loaded)
      setLocale(loaded)
      setReady(true)
      onReady?.()
    })
  }, [initialLocale, onReady])

  const setLocalePreference = useCallback(async (pref: LocalePreference) => {
    setLocaleState(pref)
    setLocale(pref)
    await saveLocale(pref)
    setTick((n) => n + 1)
  }, [])

  const value = useMemo(
    () => ({
      locale,
      activeLocale: getLocale(),
      setLocalePreference,
      t: translate,
    }),
    [locale, tick, setLocalePreference],
  )

  if (!ready) return null

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useTranslation(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error('useTranslation must be used within LocaleProvider')
  }
  return ctx
}
