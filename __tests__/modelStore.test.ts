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

// Regression: local_path used to be persisted as an absolute path. iOS
// regenerates the container UUID in
// /var/mobile/Containers/Data/Application/<UUID>/… on every app update while
// keeping the data, so the stored path pointed nowhere afterwards — and
// listInstalled's prune then deleted every model row on the first launch after
// each release.
test('survives the container path changing between app updates', async () => {
  const db = await openMemoryDatabase()
  await migrateDbIfNeeded(db)
  mockGetInfoAsync.mockResolvedValue({ exists: true })

  await modelStore.recordInstalled(db, {
    id: 'org/repo/model.gguf',
    repoId: 'org/repo',
    filename: 'model.gguf',
    displayName: 'org/repo/model.gguf',
    sizeBytes: 10,
    localPath: modelStore.modelFilePath('org/repo/model.gguf'),
    downloadedAt: 1,
    lastUsedAt: null,
  })

  // Only the file name reaches the database — nothing container-specific.
  const stored = await db.getFirstAsync<{ local_path: string }>(
    'SELECT local_path FROM models LIMIT 1',
  )
  expect(stored?.local_path).not.toContain('/')

  const list = await modelStore.listInstalled(db)
  expect(list).toHaveLength(1)
  expect(list[0].localPath).toBe(modelStore.modelFilePath('org/repo/model.gguf'))
})

test('heals a legacy row that still holds an absolute path', async () => {
  const db = await openMemoryDatabase()
  await migrateDbIfNeeded(db)
  mockGetInfoAsync.mockResolvedValue({ exists: true })

  const name = modelStore.modelFileName('org/repo/model.gguf')
  await db.runAsync(
    `INSERT INTO models
       (id, repo_id, filename, display_name, size_bytes, local_path, downloaded_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    'org/repo/model.gguf',
    'org/repo',
    'model.gguf',
    'org/repo/model.gguf',
    10,
    `file:///var/mobile/Containers/Data/Application/OLD-UUID/Library/Application Support/LocalChat/models/${name}`,
    1,
    null,
  )

  const list = await modelStore.listInstalled(db)
  expect(list).toHaveLength(1)
  expect(list[0].localPath).toBe(modelStore.modelFilePath('org/repo/model.gguf'))

  // Rewritten once, not on every read.
  const healed = await db.getFirstAsync<{ local_path: string }>(
    'SELECT local_path FROM models LIMIT 1',
  )
  expect(healed?.local_path).toBe(name)
})

test('a file that is really gone is still pruned', async () => {
  const db = await openMemoryDatabase()
  await migrateDbIfNeeded(db)
  mockGetInfoAsync.mockResolvedValue({ exists: false })

  await modelStore.recordInstalled(db, {
    id: 'org/repo/gone.gguf',
    repoId: 'org/repo',
    filename: 'gone.gguf',
    displayName: 'org/repo/gone.gguf',
    sizeBytes: 10,
    localPath: modelStore.modelFilePath('org/repo/gone.gguf'),
    downloadedAt: 1,
    lastUsedAt: null,
  })

  expect(await modelStore.listInstalled(db)).toHaveLength(0)
})
