import { ArrowUp, Square } from 'lucide-react-native'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  onStop?: () => void
  placeholder: string
  sendLabel: string
  stopLabel: string
  disabled?: boolean
  streaming?: boolean
}

export function Composer({
  value,
  onChangeText,
  onSend,
  onStop,
  placeholder,
  sendLabel,
  stopLabel,
  disabled,
  streaming,
}: Props) {
  const { colors } = useTheme()
  const inputDisabled = disabled && !streaming
  const sendDisabled = disabled || !value.trim()

  return (
    <View
      style={[styles.wrap, { borderTopColor: colors.border, backgroundColor: colors.background }]}
      accessibilityRole="none"
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        editable={!inputDisabled && !streaming}
        multiline
        accessibilityLabel={placeholder}
        accessibilityState={{ disabled: inputDisabled || streaming }}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.muted,
            borderColor: colors.border,
            fontFamily: typography.bodyFamily,
            minHeight: 44,
          },
        ]}
      />
      {streaming ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={stopLabel}
          onPress={onStop}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: colors.destructive, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Square size={16} color={colors.onPrimary} fill={colors.onPrimary} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: sendDisabled }}
          disabled={sendDisabled}
          onPress={onSend}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: colors.primary,
              opacity: sendDisabled ? 0.35 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <ArrowUp size={20} color={colors.onPrimary} strokeWidth={2.5} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 16,
  },
  // A circle, not a labelled button: "Envoyer" truncated at narrow widths and
  // its hit box drifted below 44pt. A glyph is legible in both locales and the
  // shape stays a fixed, comfortable target.
  action: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
