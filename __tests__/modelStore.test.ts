import { migrateDbIfNeeded } from '../src/db/migrate'
import * as modelStore from '../src/services/modelStore'
import { openMemoryDatabase } from './helpers/memoryDb'

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///tmp/',
  deleteAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async () => undefined),
  createDownloadResumable: jest.fn(),
}))

test('recordInstalled and listInstalled round-trip', async () => {
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

test('modelIdFor is repo/filename', () => {
  expect(modelStore.modelIdFor('a/b', 'c.gguf')).toBe('a/b/c.gguf')
})
