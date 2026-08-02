jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}))
