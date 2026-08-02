import { StyleSheet, Text, View } from 'react-native'

import { t } from '@/src/i18n'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

export default function SettingsScreen() {
  const { colors } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: typography.headingFamily }]}>
        {t('placeholder.settings')}
      </Text>
      <Text style={[styles.body, { color: colors.foreground, fontFamily: typography.bodyFamily }]}>
        {t('settings.privacy')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28 },
  body: { fontSize: 16, lineHeight: 24 },
})
