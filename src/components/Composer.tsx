import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

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
          style={[styles.btn, { backgroundColor: colors.destructive, minHeight: 44, minWidth: 44 }]}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: typography.bodySemiBoldFamily }}>
            {stopLabel}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: disabled || !value.trim() }}
          disabled={disabled || !value.trim()}
          onPress={onSend}
          style={[
            styles.btn,
            {
              backgroundColor: colors.primary,
              opacity: disabled || !value.trim() ? 0.4 : 1,
              minHeight: 44,
              minWidth: 44,
            },
          ]}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: typography.bodySemiBoldFamily }}>
            {sendLabel}
          </Text>
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
  btn: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
