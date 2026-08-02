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
import { useEffect } from 'react'
import 'react-native-reanimated'

import { migrateDbIfNeeded } from '@/src/db/migrate'
import { ThemeProvider, useTheme } from '@/src/theme/ThemeProvider'

export { ErrorBoundary } from 'expo-router'

export const unstable_settings = {
  initialRouteName: '(tabs)',
}

SplashScreen.preventAutoHideAsync()

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

  const loaded = loraLoaded && ralewayLoaded
  const error = loraError ?? ralewayError

  useEffect(() => {
    if (error) throw error
  }, [error])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])

  if (!loaded) {
    return null
  }

  return (
    <ThemeProvider>
      <SQLiteProvider databaseName="localchat.db" onInit={migrateDbIfNeeded}>
        <RootLayoutNav />
      </SQLiteProvider>
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
    </Stack>
  )
}
