jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}))

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
}))

jest.mock('expo-device', () => ({
  totalMemory: 4 * 1024 * 1024 * 1024,
}))

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
