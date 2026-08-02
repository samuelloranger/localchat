export const colors = {
  light: {
    primary: '#0D9488',
    onPrimary: '#FFFFFF',
    background: '#FAFAF8',
    foreground: '#14201F',
    muted: '#F0F4F3',
    border: '#D5DEDC',
    destructive: '#DC2626',
    ring: '#0D9488',
  },
  dark: {
    primary: '#0D9488',
    onPrimary: '#FFFFFF',
    background: '#0C1211',
    foreground: '#E8EEEC',
    muted: '#1A2422',
    border: '#2A3734',
    destructive: '#DC2626',
    ring: '#0D9488',
  },
} as const

export type ColorScheme = keyof typeof colors
export type ThemeColors = (typeof colors)[ColorScheme]
