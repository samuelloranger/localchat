import {
  Lora_400Regular,
  Lora_600SemiBold,
  useFonts as useLoraFonts,
} from '@expo-google-fonts/lora'
import {
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  useFonts as useRalewayFonts,
} from '@expo-google-fonts/raleway'
import { Stack } from 'expo-router'
import { SQLiteProvider } from 'expo-sqlite'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState, type ReactNode } from 'react'
import 'react-native-reanimated'

import { migrateDbIfNeeded } from '@/src/db/migrate'
import type { LocalePreference } from '@/src/i18n'
import { LocaleProvider } from '@/src/i18n/LocaleProvider'
import { loadAppearance, loadLocale } from '@/src/services/preferences'
import { ThemeProvider, useTheme } from '@/src/theme/ThemeProvider'

export { ErrorBoundary } from 'expo-router'

export const unstable_settings = {
  initialRouteName: '(tabs)',
}

SplashScreen.preventAutoHideAsync()

function BootstrapPrefs({
  children,
  onReady,
}: {
  children: (prefs: { appearance: Awaited<ReturnType<typeof loadAppearance>>; locale: LocalePreference }) => ReactNode
  onReady: () => void
}) {
  const { setAppearance } = useTheme()
  const [prefs, setPrefs] = useState<{
    appearance: Awaited<ReturnType<typeof loadAppearance>>
    locale: LocalePreference
  } | null>(null)

  useEffect(() => {
    void (async () => {
      const [appearance, locale] = await Promise.all([loadAppearance(), loadLocale()])
      setAppearance(appearance)
      setPrefs({ appearance, locale })
      onReady()
    })()
  }, [setAppearance, onReady])

  if (!prefs) return null

  return <>{children(prefs)}</>
}

export default function RootLayout() {
  const [loraLoaded, loraError] = useLoraFonts({
    Lora_400Regular,
    Lora_600SemiBold,
  })
  const [ralewayLoaded, ralewayError] = useRalewayFonts({
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold,
  })
  const [prefsReady, setPrefsReady] = useState(false)

  const loaded = loraLoaded && ralewayLoaded
  const error = loraError ?? ralewayError

  useEffect(() => {
    if (error) throw error
  }, [error])

  useEffect(() => {
    if (loaded && prefsReady) {
      void SplashScreen.hideAsync().catch(() => {
        // Splash may already be hidden
      })
    }
  }, [loaded, prefsReady])

  if (!loaded) {
    return null
  }

  return (
    <ThemeProvider>
      <BootstrapPrefs onReady={() => setPrefsReady(true)}>
        {(prefs) => (
          <LocaleProvider initialLocale={prefs.locale}>
            <SQLiteProvider databaseName="localchat.db" onInit={migrateDbIfNeeded}>
              <RootLayoutNav />
            </SQLiteProvider>
          </LocaleProvider>
        )}
      </BootstrapPrefs>
    </ThemeProvider>
  )
}

function RootLayoutNav() {
  const { colors } = useTheme()

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
    </Stack>
  )
}
