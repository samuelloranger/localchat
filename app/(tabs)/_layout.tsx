import { MessageCircle, Boxes, Settings } from 'lucide-react-native'
import { Tabs } from 'expo-router'

import { useTranslation } from '@/src/i18n/LocaleProvider'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

export default function TabLayout() {
  const { colors } = useTheme()
  const { t } = useTranslation()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: {
          color: colors.foreground,
          fontFamily: typography.headingFamily,
          fontSize: 17,
        },
        tabBarLabelStyle: { fontFamily: typography.bodyMediumFamily, fontSize: 11 },
        headerTintColor: colors.primary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.chats'),
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="models"
        options={{
          title: t('tabs.models'),
          tabBarIcon: ({ color, size }) => <Boxes color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
