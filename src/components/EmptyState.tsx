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
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.onPrimary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // Centred in the space it is given rather than pinned to the top-left: an
  // empty list is mostly emptiness, and copy stranded in the corner reads as a
  // rendering accident.
  wrap: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 12,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  title: { fontFamily: typography.headingFamily, fontSize: 25, lineHeight: 32 },
  body: { fontFamily: typography.bodyFamily, fontSize: 15, lineHeight: 23 },
  btn: {
    marginTop: 10,
    paddingHorizontal: 18,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: typography.bodySemiBoldFamily, fontSize: 15 },
})
