import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mockTmpRoot = join(tmpdir(), `localchat-dl-${process.pid}`)

function mockPathKey(uri: string): string {
  return uri.replace(/^file:\/\//, '')
}

function ggufBytes(payload: string, padTo?: number): Buffer {
  const buf = Buffer.alloc(Math.max(4 + payload.length, padTo ?? 4 + payload.length))
  buf.write('GGUF', 0, 4, 'ascii')
  if (payload) buf.write(payload, 4, 'utf8')
  return buf
}

jest.mock('expo-file-system/legacy', () => {
  const { mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
  const mockPartialStore = new Map<string, Buffer>()
  const mockResumeStore = new Map<string, string>()

  const mockPathKey = (uri: string) => uri.replace(/^file:\/\//, '')

  return {
    documentDirectory: `file://${mockTmpRoot}/`,
    EncodingType: { Base64: 'base64' },
    getInfoAsync: jest.fn(async (uri: string) => {
      const key = mockPathKey(uri)
      const data = mockPartialStore.get(key)
      if (data) return { exists: true, size: data.length }
      if (mockResumeStore.has(key)) return { exists: true }
      try {
        const stat = readFileSync(key)
        return { exists: true, size: stat.length }
      } catch {
        return { exists: false }
      }
    }),
    makeDirectoryAsync: jest.fn(async (uri: string) => {
      mkdirSync(mockPathKey(uri), { recursive: true })
    }),
    deleteAsync: jest.fn(async (uri: string) => {
      const key = mockPathKey(uri)
      mockPartialStore.delete(key)
      mockResumeStore.delete(key)
      try {
        rmSync(key, { force: true })
      } catch {
        // ignore
      }
    }),
    moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
      const fromKey = mockPathKey(from)
      const toKey = mockPathKey(to)
      const data = mockPartialStore.get(fromKey) ?? readFileSync(fromKey)
      writeFileSync(toKey, data)
      mockPartialStore.delete(fromKey)
      try {
        rmSync(fromKey, { force: true })
      } catch {
        // ignore
      }
    }),
    readAsStringAsync: jest.fn(
      async (uri: string, opts?: { encoding?: string; position?: number; length?: number }) => {
        const key = mockPathKey(uri)
        if (mockResumeStore.has(key)) return mockResumeStore.get(key)!
        const data = mockPartialStore.get(key) ?? readFileSync(key)
        if (
          opts?.encoding === 'base64' &&
          typeof opts.position === 'number' &&
          typeof opts.length === 'number'
        ) {
          return data.subarray(opts.position, opts.position + opts.length).toString('base64')
        }
        return data.toString('utf8')
      },
    ),
    writeAsStringAsync: jest.fn(async (uri: string, contents: string) => {
      mockResumeStore.set(mockPathKey(uri), contents)
    }),
    createDownloadResumable: jest.fn(),
    __mockStores: { mockPartialStore, mockResumeStore },
  }
})

import {
  base64ToAscii,
  DownloadError,
  DownloadErrorCode,
  downloadGguf,
  nextRangeHeader,
} from '../src/services/downloadManager'

function mockStores() {
  const fs = jest.requireMock('expo-file-system/legacy') as {
    __mockStores: {
      mockPartialStore: Map<string, Buffer>
      mockResumeStore: Map<string, string>
    }
  }
  return fs.__mockStores
}

beforeEach(() => {
  const { mockPartialStore, mockResumeStore } = mockStores()
  mockPartialStore.clear()
  mockResumeStore.clear()
  rmSync(mockTmpRoot, { recursive: true, force: true })
  mkdirSync(mockTmpRoot, { recursive: true })
})

test('nextRangeHeader for transport mocks', () => {
  expect(nextRangeHeader(0)).toBeUndefined()
  expect(nextRangeHeader(4096)).toBe('bytes=4096-')
})

test('resume via transport produces byte-identical file', async () => {
  const { mockPartialStore } = mockStores()
  const destPath = `file://${mockTmpRoot}/model.gguf`
  const full = ggufBytes('payload', 128)

  await expect(
    downloadGguf({
      url: 'https://example.com/m.gguf',
      destPath,
      expectedBytes: full.length,
      transport: async ({ partialPath }) => {
        mockPartialStore.set(mockPathKey(partialPath), full.subarray(0, 64))
        return {
          url: 'https://example.com/m.gguf',
          fileUri: partialPath,
          options: {},
          resumeData: 'resume-token',
        }
      },
    }),
  ).rejects.toMatchObject({ code: DownloadErrorCode.ABORTED })

  await downloadGguf({
    url: 'https://example.com/m.gguf',
    destPath,
    expectedBytes: full.length,
    transport: async ({ partialPath, resumeState }) => {
      expect(resumeState?.resumeData).toBe('resume-token')
      const existing = mockPartialStore.get(mockPathKey(partialPath)) ?? Buffer.alloc(0)
      expect(existing.length).toBe(64)
      mockPartialStore.set(mockPathKey(partialPath), full)
      return null
    },
  })

  const final = readFileSync(mockPathKey(destPath))
  expect(final.equals(full)).toBe(true)
})

test('rejects short download without creating destPath', async () => {
  const { mockPartialStore } = mockStores()
  const destPath = `file://${mockTmpRoot}/short.gguf`

  await expect(
    downloadGguf({
      url: 'https://example.com/s.gguf',
      destPath,
      expectedBytes: 100,
      transport: async ({ partialPath }) => {
        mockPartialStore.set(mockPathKey(partialPath), Buffer.from('GG'))
        return null
      },
    }),
  ).rejects.toMatchObject({ code: DownloadErrorCode.INCOMPLETE })

  expect(() => readFileSync(mockPathKey(destPath))).toThrow()
})

test('rejects non-GGUF payload', async () => {
  const { mockPartialStore } = mockStores()
  const destPath = `file://${mockTmpRoot}/bad.gguf`

  await expect(
    downloadGguf({
      url: 'https://example.com/bad.gguf',
      destPath,
      transport: async ({ partialPath }) => {
        mockPartialStore.set(mockPathKey(partialPath), Buffer.from('<htm'))
        return null
      },
    }),
  ).rejects.toMatchObject({ code: DownloadErrorCode.NOT_GGUF })

  expect(() => readFileSync(mockPathKey(destPath))).toThrow()
})

test('DownloadError exposes typed code', () => {
  const err = new DownloadError(DownloadErrorCode.FAILED)
  expect(err.code).toBe('DOWNLOAD_FAILED')
  expect(err).toBeInstanceOf(Error)
})

// Regression: verifyPartial decoded the header with Buffer.from(), a Node
// global that exists under Jest and not on Hermes. Every download failed at the
// verification step — after the full transfer — with a bare ReferenceError that
// reached the UI as the generic "download failed" message. Run the whole happy
// path with Buffer removed from globalThis to prove nothing depends on it.
test('completes a download in an environment without Buffer (Hermes)', async () => {
  const { mockPartialStore } = mockStores()
  const payload = ggufBytes('weights', 64)
  const destPath = `file://${mockTmpRoot}/no-buffer-model.gguf`

  // The transport runs before Buffer is removed so the fixture can be staged
  // with it; only the code under test has to survive its absence.
  const transport = async ({ partialPath }: { partialPath: string }) => {
    mockPartialStore.set(mockPathKey(partialPath), payload)
    return null
  }

  const savedBuffer = globalThis.Buffer
  // @ts-expect-error deliberately emulating a runtime with no Buffer global
  delete globalThis.Buffer
  try {
    await downloadGguf({
      url: 'https://example.test/model.gguf',
      destPath,
      expectedBytes: payload.length,
      transport,
    })
  } finally {
    globalThis.Buffer = savedBuffer
  }

  expect(readFileSync(mockPathKey(destPath))).toEqual(payload)
})

test('base64ToAscii decodes the GGUF magic', () => {
  expect(base64ToAscii('R0dVRg==')).toBe('GGUF')
  expect(base64ToAscii(Buffer.from('GGUF').toString('base64'))).toBe('GGUF')
  expect(base64ToAscii(Buffer.from('<htm').toString('base64'))).toBe('<htm')
})
