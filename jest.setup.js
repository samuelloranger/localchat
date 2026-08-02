jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}))

jest.mock('expo-device', () => ({
  totalMemory: 4 * 1024 * 1024 * 1024,
}))
