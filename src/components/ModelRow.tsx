import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  title: string
  subtitle: string
  progress?: number | null
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  disabled?: boolean
  /** Soft visual mute when the model cannot run (still shown). */
  unfit?: boolean
  warning?: string
}

export function ModelRow({
  title,
  subtitle,
  progress,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  disabled,
  unfit,
  warning,
}: Props) {
  const { colors } = useTheme()
  const busy = typeof progress === 'number'
  const blocked = disabled || busy || !!unfit

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.border, opacity: unfit ? 0.72 : 1 },
      ]}
    >
      <View style={styles.meta}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: typography.bodySemiBoldFamily }]}>
          {title}
        </Text>
        <Text style={[styles.sub, { color: colors.foreground, fontFamily: typography.bodyFamily }]}>
          {subtitle}
        </Text>
        {warning ? (
          <Text
            style={[styles.warn, { color: colors.destructive, fontFamily: typography.bodyMediumFamily }]}
            accessibilityRole="text"
          >
            {warning}
          </Text>
        ) : null}
        {busy ? (
          <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={onPrimary}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: colors.primary,
              opacity: blocked ? 0.35 : pressed ? 0.85 : 1,
              minHeight: 44,
              minWidth: 44,
            },
          ]}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: typography.bodyMediumFamily }}>
            {primaryLabel}
          </Text>
        </Pressable>
        {secondaryLabel && onSecondary ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSecondary}
            style={({ pressed }) => [
              styles.btnOutline,
              {
                borderColor: colors.destructive,
                opacity: pressed ? 0.85 : 1,
                minHeight: 44,
                minWidth: 44,
              },
            ]}
          >
            <Text style={{ color: colors.destructive, fontFamily: typography.bodyMediumFamily }}>
              {secondaryLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  meta: { flex: 1, gap: 4 },
  title: { fontSize: 16 },
  sub: { fontSize: 13, opacity: 0.75 },
  warn: { fontSize: 12, marginTop: 2 },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 4 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  btn: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  btnOutline: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
})
