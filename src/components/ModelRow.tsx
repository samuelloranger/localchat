import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  title: string
  subtitle: string
  accessibilityHint?: string
  progress?: number | null
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  disabled?: boolean
  /** Blocks the primary action (e.g. another download in progress). */
  blockPrimary?: boolean
  /** Soft visual mute when the model may not fit RAM — does not block the button. */
  unfit?: boolean
  warning?: string
  downloadError?: string
  onRetryDownload?: () => void
  retryLabel?: string
}

export function ModelRow({
  title,
  subtitle,
  accessibilityHint,
  progress,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  disabled,
  blockPrimary,
  unfit,
  warning,
  downloadError,
  onRetryDownload,
  retryLabel,
}: Props) {
  const { colors } = useTheme()
  const busy = typeof progress === 'number'
  const blocked = disabled || busy || !!blockPrimary

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.border, opacity: unfit ? 0.72 : 1 },
      ]}
      accessibilityRole="none"
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.meta}>
        <Text
          style={[styles.title, { color: colors.foreground, fontFamily: typography.bodySemiBoldFamily }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        <Text
          style={[styles.sub, { color: colors.mutedForeground, fontFamily: typography.bodyFamily }]}
        >
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
        {downloadError ? (
          <View style={styles.errorRow}>
            <Text
              style={[styles.warn, { color: colors.destructive, fontFamily: typography.bodyMediumFamily }]}
              accessibilityRole="alert"
            >
              {downloadError}
            </Text>
            {onRetryDownload && retryLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={onRetryDownload}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, minHeight: 44, justifyContent: 'center' }]}
              >
                <Text style={{ color: colors.primary, fontFamily: typography.bodyMediumFamily }}>
                  {retryLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {busy ? (
          <View
            style={[styles.barTrack, { backgroundColor: colors.border }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round((progress ?? 0) * 100) }}
          >
            <View
              style={[
                styles.barFill,
                { width: `${Math.round((progress ?? 0) * 100)}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {busy ? <ActivityIndicator color={colors.primary} accessibilityLabel={primaryLabel} /> : null}
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
  sub: { fontSize: 13 },
  warn: { fontSize: 12, marginTop: 2 },
  errorRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
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
