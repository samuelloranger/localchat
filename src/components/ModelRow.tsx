import { ArrowDown, Check, MessageSquarePlus, Trash2, X } from 'lucide-react-native'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  /** Model family, already stripped of repo prefix and quant suffix. */
  title: string
  /** The one token that distinguishes siblings in a repo: Q4_K_M, IQ3_XS… */
  quant?: string
  /** Facts, each its own cell — never a run-on sentence. */
  metrics?: string[]
  /** 0–1: estimated runtime memory as a share of what this device can spend. */
  fitRatio?: number | null
  accessibilityHint?: string
  progress?: number | null
  primaryLabel: string
  primaryIcon?: 'download' | 'chat'
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  disabled?: boolean
  /** Blocks the primary action (e.g. another download in progress). */
  blockPrimary?: boolean
  /** Soft visual mute when the model may not fit RAM — does not block the button. */
  unfit?: boolean
  installed?: boolean
  warning?: string
  downloadError?: string
  onRetryDownload?: () => void
  retryLabel?: string
}

/**
 * The rows of this list are not independent listings — they are siblings on a
 * quality/size axis, and the reader's job is to pick a point on it for their
 * device. So the quant leads (it is the only token that differs between
 * siblings), the family name is secondary, and the facts are set as separate
 * cells rather than one grey sentence.
 *
 * The fit meter is the point of the screen: it draws the file's estimated
 * memory against what this phone can actually spend, which turns "~2.4 GB of
 * RAM" from a number into a judgement.
 */
export function ModelRow({
  title,
  quant,
  metrics,
  fitRatio,
  accessibilityHint,
  progress,
  primaryLabel,
  primaryIcon = 'download',
  onPrimary,
  secondaryLabel,
  onSecondary,
  disabled,
  blockPrimary,
  unfit,
  installed,
  warning,
  downloadError,
  onRetryDownload,
  retryLabel,
}: Props) {
  const { colors } = useTheme()
  const busy = typeof progress === 'number'
  const blocked = disabled || busy || !!blockPrimary
  const PrimaryIcon = primaryIcon === 'chat' ? MessageSquarePlus : ArrowDown

  return (
    <View
      style={[styles.row, { borderBottomColor: colors.border }]}
      accessibilityRole="none"
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.meta}>
        <View style={styles.titleRow}>
          {quant ? (
            <View
              style={[
                styles.quant,
                {
                  borderColor: unfit ? colors.border : colors.primary,
                  backgroundColor: unfit ? 'transparent' : colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.quantText,
                  { color: unfit ? colors.mutedForeground : colors.onPrimary },
                ]}
              >
                {quant}
              </Text>
            </View>
          ) : null}
          {installed ? <Check size={14} color={colors.primary} strokeWidth={3} /> : null}
          <Text
            numberOfLines={2}
            style={[styles.title, { color: unfit ? colors.mutedForeground : colors.foreground }]}
            accessibilityRole="header"
          >
            {title}
          </Text>
        </View>

        {metrics?.length ? (
          <View style={styles.metrics}>
            {metrics.map((metric, i) => (
              <View key={metric} style={styles.metricCell}>
                {i > 0 ? (
                  <View style={[styles.metricDot, { backgroundColor: colors.border }]} />
                ) : null}
                <Text style={[styles.metricText, { color: colors.mutedForeground }]}>{metric}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {typeof fitRatio === 'number' && !busy ? (
          <FitMeter ratio={fitRatio} unfit={!!unfit} />
        ) : null}

        {warning ? (
          <Text style={[styles.warn, { color: colors.destructive }]} accessibilityRole="text">
            {warning}
          </Text>
        ) : null}

        {downloadError ? (
          <View style={styles.errorRow}>
            <Text style={[styles.warn, { color: colors.destructive }]} accessibilityRole="alert">
              {downloadError}
            </Text>
            {onRetryDownload && retryLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={onRetryDownload}
                style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.retryText, { color: colors.primary }]}>{retryLabel}</Text>
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
        {busy ? (
          <ActivityIndicator color={colors.primary} accessibilityLabel={primaryLabel} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityState={{ disabled: blocked }}
            disabled={blocked}
            onPress={onPrimary}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: colors.primary,
                opacity: blocked ? 0.3 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <PrimaryIcon size={18} color={colors.onPrimary} strokeWidth={2.5} />
          </Pressable>
        )}
        {secondaryLabel && onSecondary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
            onPress={onSecondary}
            style={({ pressed }) => [
              styles.action,
              styles.actionGhost,
              { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {busy ? (
              <X size={18} color={colors.destructive} strokeWidth={2.5} />
            ) : (
              <Trash2 size={17} color={colors.destructive} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Estimated memory against this device's usable budget. The track is the
 * budget, the fill is the model; overflowing the track is the whole message,
 * so past 100% the fill turns destructive and stops at the edge.
 */
function FitMeter({ ratio, unfit }: { ratio: number; unfit: boolean }) {
  const { colors } = useTheme()
  const clamped = Math.max(0.02, Math.min(1, ratio))
  return (
    <View style={[styles.fitTrack, { backgroundColor: colors.border }]}>
      <View
        style={[
          styles.fitFill,
          {
            width: `${clamped * 100}%`,
            backgroundColor: unfit ? colors.destructive : colors.primary,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  meta: { flex: 1, gap: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  // The quant leads because it is the only thing that differs between the
  // sibling files of one repo.
  quant: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quantText: {
    fontFamily: typography.bodySemiBoldFamily,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  title: { flex: 1, fontFamily: typography.bodySemiBoldFamily, fontSize: 15, lineHeight: 20 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  metricCell: { flexDirection: 'row', alignItems: 'center' },
  metricDot: { width: 2, height: 2, borderRadius: 1, marginHorizontal: 8 },
  metricText: { fontFamily: typography.bodyFamily, fontSize: 12.5 },
  fitTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  fitFill: { height: 3, borderRadius: 2 },
  warn: { fontFamily: typography.bodyMediumFamily, fontSize: 12, lineHeight: 17 },
  errorRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryText: { fontFamily: typography.bodySemiBoldFamily, fontSize: 12 },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  // Icons, not labels: "Télécharger" repeated down the list was the loudest
  // thing on screen while carrying no per-row information, and it took the
  // width the model name needed.
  action: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionGhost: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth },
})
