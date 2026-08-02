import { migrateDbIfNeeded } from '../src/db/migrate'
import { openMemoryDatabase } from './helpers/memoryDb'

const mockGetInfoAsync = jest.fn(async (_path: string) => ({ exists: false }))

jest.mock('llama.rn', () => ({
  initLlama: jest.fn(),
}))

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///tmp/Documents/',
  deleteAsync: jest.fn(async () => undefined),
  getInfoAsync: (path: string) => mockGetInfoAsync(path),
  makeDirectoryAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async () => undefined),
  createDownloadResumable: jest.fn(),
}))

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

import * as modelStore from '../src/services/modelStore'

beforeEach(() => {
  mockGetInfoAsync.mockReset()
})

test('recordInstalled and listInstalled round-trip existing files only', async () => {
  mockGetInfoAsync.mockResolvedValue({ exists: true })
  const db = await openMemoryDatabase()
  await migrateDbIfNeeded(db)
  await modelStore.recordInstalled(db, {
    id: 'owner/repo/file.gguf',
    repoId: 'owner/repo',
    filename: 'file.gguf',
    displayName: 'file',
    sizeBytes: 100,
    localPath: 'file:///tmp/models/x.gguf',
    downloadedAt: 1,
    lastUsedAt: null,
  })
  const list = await modelStore.listInstalled(db)
  expect(list).toHaveLength(1)
  expect(list[0].id).toBe('owner/repo/file.gguf')
})

test('listInstalled drops missing files from the database', async () => {
  mockGetInfoAsync.mockResolvedValue({ exists: false })
  const db = await openMemoryDatabase()
  await migrateDbIfNeeded(db)
  await modelStore.recordInstalled(db, {
    id: 'owner/repo/missing.gguf',
    repoId: 'owner/repo',
    filename: 'missing.gguf',
    displayName: 'missing',
    sizeBytes: 100,
    localPath: 'file:///tmp/models/missing.gguf',
    downloadedAt: 1,
    lastUsedAt: null,
  })
  expect(await modelStore.listInstalled(db)).toHaveLength(0)
  const row = await db.getFirstAsync(`SELECT id FROM models WHERE id = ?`, 'owner/repo/missing.gguf')
  expect(row).toBeNull()
})

test('modelIdFor is repo/filename', () => {
  expect(modelStore.modelIdFor('a/b', 'c.gguf')).toBe('a/b/c.gguf')
})

test('modelsDirectory on iOS uses Application Support', () => {
  expect(modelStore.modelsDirectory()).toBe(
    'file:///tmp/Library/Application Support/LocalChat/models/',
  )
})

test('modelFilePath nests under modelsDirectory', () => {
  expect(modelStore.modelFilePath('a/b/c.gguf')).toContain('Application Support/LocalChat/models/')
})
