import * as Clipboard from 'expo-clipboard'
import { useCallback, useEffect, useRef } from 'react'
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native'

import type { MessageRole } from '@/src/domain/types'
import { useReducedMotion } from '@/src/hooks/useReducedMotion'
import { useTranslation } from '@/src/i18n/LocaleProvider'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  role: MessageRole
  content: string
  status?: string
  /** Shown under a finished assistant turn: which model produced it, how fast. */
  provenance?: string
}

/**
 * The two sides are deliberately not symmetrical.
 *
 * A cloud chat bubbles both parties because both are remote correspondents.
 * Here one party is the device itself: the user's turn stays a compact capsule,
 * the model's turn is set as open text against a teal rail — the machine
 * writing into the page rather than mailing something back. It also hands the
 * long answers a small model tends to produce the full width of the screen
 * instead of 85% of it.
 */
export function MessageBubble({ role, content, status, provenance }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const mine = role === 'user'
  const streaming = status === 'streaming'
  const label = mine ? t('chat.userMessage') : t('chat.assistantMessage')

  const onLongPress = useCallback(() => {
    if (!content.trim()) return
    void Clipboard.setStringAsync(content).then(() => {
      Alert.alert(t('chat.copy'))
    })
  }, [content, t])

  if (mine) {
    return (
      <View style={styles.userRow}>
        <Pressable
          accessibilityRole="text"
          accessibilityLabel={label}
          onLongPress={onLongPress}
          delayLongPress={400}
          style={[styles.userCapsule, { backgroundColor: colors.primary }]}
        >
          <Text selectable style={[styles.userText, { color: colors.onPrimary }]}>
            {content}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.assistantRow}>
      <View style={[styles.rail, { backgroundColor: colors.primary }]} />
      <Pressable
        accessibilityRole="text"
        accessibilityLabel={label}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={styles.assistantBody}
      >
        <Text selectable style={[styles.assistantText, { color: colors.foreground }]}>
          {content}
          {streaming ? <Caret /> : null}
        </Text>
        {provenance ? (
          <Text style={[styles.provenance, { color: colors.mutedForeground }]}>{provenance}</Text>
        ) : null}
      </Pressable>
    </View>
  )
}

/**
 * A blinking block at the tail of a streaming reply — the only motion on this
 * screen, and the one thing that says "still generating" without a spinner.
 * Held steady when Reduce Motion is on.
 */
function Caret() {
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 480, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity, reduceMotion])

  return <Animated.Text style={{ opacity, color: colors.primary }}>{'█'}</Animated.Text>
}

const styles = StyleSheet.create({
  userRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
    alignItems: 'flex-end',
  },
  userCapsule: {
    maxWidth: '82%',
    borderRadius: 16,
    // Notched toward the composer, so the capsule points at its author.
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    fontFamily: typography.bodyMediumFamily,
    fontSize: 16,
    lineHeight: 23,
  },
  assistantRow: {
    flexDirection: 'row',
    paddingLeft: 16,
    paddingRight: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  rail: {
    width: 2,
    borderRadius: 1,
    marginRight: 14,
    // Inset so the rail reads as a margin mark against the text, not a border
    // around the row box.
    marginTop: 3,
    marginBottom: 3,
  },
  assistantBody: { flex: 1 },
  assistantText: {
    fontFamily: typography.bodyFamily,
    fontSize: 16,
    // Looser than the capsule: this is the side people actually read.
    lineHeight: 25,
  },
  provenance: {
    marginTop: 8,
    fontFamily: typography.bodyMediumFamily,
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
})
