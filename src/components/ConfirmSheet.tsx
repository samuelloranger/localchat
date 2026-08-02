import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  visible: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.muted, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.foreground, fontFamily: typography.headingFamily }]}>
            {title}
          </Text>
          <Text style={[styles.body, { color: colors.foreground, fontFamily: typography.bodyFamily }]}>
            {body}
          </Text>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={[styles.btn, { borderColor: colors.border, minHeight: 44 }]}
            >
              <Text style={{ color: colors.foreground, fontFamily: typography.bodyMediumFamily }}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={[
                styles.btn,
                {
                  backgroundColor: destructive ? colors.destructive : colors.primary,
                  minHeight: 44,
                },
              ]}
            >
              <Text style={{ color: colors.onPrimary, fontFamily: typography.bodySemiBoldFamily }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 20 },
  body: { fontSize: 16, lineHeight: 24 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
})
