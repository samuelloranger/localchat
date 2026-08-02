import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme as useSystemColorScheme } from 'react-native'

import { colors, type ColorScheme, type ThemeColors } from './colors'

export type AppearancePreference = 'system' | 'light' | 'dark'

type ThemeContextValue = {
  colors: ThemeColors
  scheme: ColorScheme
  appearance: AppearancePreference
  setAppearance: (value: AppearancePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme()
  const [appearance, setAppearanceState] = useState<AppearancePreference>('system')

  const scheme: ColorScheme =
    appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance

  const setAppearance = useCallback((value: AppearancePreference) => {
    setAppearanceState(value)
  }, [])

  const value = useMemo(
    () => ({
      colors: colors[scheme],
      scheme,
      appearance,
      setAppearance,
    }),
    [appearance, scheme, setAppearance],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
