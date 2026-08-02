import * as Clipboard from 'expo-clipboard'
import { useCallback } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'

import type { MessageRole } from '@/src/domain/types'
import { useTranslation } from '@/src/i18n/LocaleProvider'
import { useTheme } from '@/src/theme/ThemeProvider'
import { typography } from '@/src/theme/typography'

type Props = {
  role: MessageRole
  content: string
  status?: string
}

export function MessageBubble({ role, content, status }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const mine = role === 'user'
  const label = mine ? t('chat.userMessage') : t('chat.assistantMessage')

  const onLongPress = useCallback(() => {
    if (!content.trim()) return
    void Clipboard.setStringAsync(content).then(() => {
      Alert.alert(t('chat.copy'))
    })
  }, [content, t])

  return (
    <View style={[styles.row, mine ? styles.right : styles.left]}>
      <Pressable
        accessibilityRole="text"
        accessibilityLabel={label}
        onLongPress={onLongPress}
        delayLongPress={400}
      >
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
            selectable
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
      </Pressable>
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
