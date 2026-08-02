import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, body, actionLabel, onAction }: Props) {
  const { colors } = useTheme()
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: typography.headingFamily }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: colors.foreground, fontFamily: typography.bodyFamily }]}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, minHeight: 44 },
          ]}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: typography.bodySemiBoldFamily }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 12, alignItems: 'flex-start' },
  title: { fontSize: 24 },
  body: { fontSize: 16, lineHeight: 24 },
  btn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
