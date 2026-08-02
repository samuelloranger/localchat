import { StyleSheet, Text, View } from 'react-native'

import type { MessageRole } from '@/src/domain/types'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  role: MessageRole
  content: string
  status?: string
}

export function MessageBubble({ role, content, status }: Props) {
  const { colors } = useTheme()
  const mine = role === 'user'
  return (
    <View style={[styles.row, mine ? styles.right : styles.left]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? colors.primary : colors.muted,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={{
            color: mine ? colors.onPrimary : colors.foreground,
            fontFamily: typography.bodyFamily,
            fontSize: 16,
            lineHeight: 24,
          }}
        >
          {content || (status === 'streaming' ? '…' : '')}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 6 },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
})
