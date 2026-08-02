import { t, setLocale } from '../src/i18n'

test('falls back to English for missing FR key', () => {
  setLocale('fr')
  expect(t('test.onlyInEn')).toBe('English only')
})

test('returns FR when present', () => {
  setLocale('fr')
  expect(t('tabs.chats')).toBe('Discussions')
})
