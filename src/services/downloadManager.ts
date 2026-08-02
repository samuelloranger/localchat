import * as FileSystem from 'expo-file-system/legacy'

export const DownloadErrorCode = {
  INCOMPLETE: 'DOWNLOAD_INCOMPLETE',
  NOT_GGUF: 'DOWNLOAD_NOT_GGUF',
  ABORTED: 'DOWNLOAD_ABORTED',
  FAILED: 'DOWNLOAD_FAILED',
} as const

export type DownloadErrorCode = (typeof DownloadErrorCode)[keyof typeof DownloadErrorCode]

export class DownloadError extends Error {
  readonly code: DownloadErrorCode

  constructor(code: DownloadErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'DownloadError'
    this.code = code
  }
}

const GGUF_MAGIC = 'GGUF'

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Decode base64 to an ASCII string without Buffer or atob.
 *
 * Hermes provides neither. Buffer is a Node global that exists under Jest and
 * not on device, so using it here failed every download at the verification
 * step — after the bytes had already been transferred — with a bare
 * ReferenceError that surfaced as the generic "download failed" message.
 *
 * Only ever called on the 4-byte file header, so a compact decoder is enough.
 */
export function base64ToAscii(b64: string): string {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  let bits = 0
  let acc = 0
  let out = ''
  for (const ch of clean) {
    const value = B64_ALPHABET.indexOf(ch)
    if (value < 0) continue
    acc = (acc << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((acc >> bits) & 0xff)
    }
  }
  return out
}

/** Test helper: hand-rolled Range header for transport mocks that emulate HTTP resume. */
export function nextRangeHeader(partialBytes: number): string | undefined {
  if (partialBytes <= 0) return undefined
  return `bytes=${partialBytes}-`
}

export type DownloadTransport = (args: {
  url: string
  partialPath: string
  resumeState: FileSystem.DownloadPauseState | null
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}) => Promise<FileSystem.DownloadPauseState | null>

export type DownloadGgufParams = {
  url: string
  destPath: string
  expectedBytes?: number
  onProgress?: (progress: number) => void
  signal?: AbortSignal
  /** Test seam: inject transport only; shared path handles dirs, resume, verify, rename. */
  transport?: DownloadTransport
}

async function ensureParentDirectory(destPath: string): Promise<void> {
  const destDir = destPath.slice(0, destPath.lastIndexOf('/'))
  if (!destDir) return
  const dirInfo = await FileSystem.getInfoAsync(destDir)
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true })
  }
}

function resumeJsonPath(destPath: string): string {
  return `${destPath}.resume.json`
}

async function readResumeState(destPath: string): Promise<FileSystem.DownloadPauseState | null> {
  const path = resumeJsonPath(destPath)
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) return null
  try {
    const raw = await FileSystem.readAsStringAsync(path)
    return JSON.parse(raw) as FileSystem.DownloadPauseState
  } catch {
    return null
  }
}

async function writeResumeState(
  destPath: string,
  state: FileSystem.DownloadPauseState,
): Promise<void> {
  await FileSystem.writeAsStringAsync(resumeJsonPath(destPath), JSON.stringify(state))
}

async function clearPartialAndResume(partialPath: string, destPath: string): Promise<void> {
  await FileSystem.deleteAsync(partialPath, { idempotent: true })
  await FileSystem.deleteAsync(resumeJsonPath(destPath), { idempotent: true })
}

async function verifyPartial(partialPath: string, expectedBytes?: number): Promise<void> {
  const info = await FileSystem.getInfoAsync(partialPath)
  const size = info.exists && 'size' in info ? Number(info.size ?? 0) : 0

  if (typeof expectedBytes === 'number' && expectedBytes > 0 && size !== expectedBytes) {
    throw new DownloadError(
      DownloadErrorCode.INCOMPLETE,
      `expected ${expectedBytes} bytes, got ${size}`,
    )
  }

  if (size < 4) {
    throw new DownloadError(DownloadErrorCode.NOT_GGUF, 'file too short for GGUF header')
  }

  const headerB64 = await FileSystem.readAsStringAsync(partialPath, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length: 4,
  })
  const magic = base64ToAscii(headerB64).slice(0, 4)
  if (magic !== GGUF_MAGIC) {
    throw new DownloadError(DownloadErrorCode.NOT_GGUF, `magic ${JSON.stringify(magic)}`)
  }
}

async function finalizeDownload(partialPath: string, destPath: string): Promise<void> {
  await FileSystem.deleteAsync(destPath, { idempotent: true })
  await FileSystem.moveAsync({ from: partialPath, to: destPath })
  await FileSystem.deleteAsync(resumeJsonPath(destPath), { idempotent: true })
}

async function runExpoTransport(args: {
  url: string
  partialPath: string
  resumeState: FileSystem.DownloadPauseState | null
  expectedBytes?: number
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}): Promise<FileSystem.DownloadPauseState | null> {
  const { url, partialPath, resumeState, expectedBytes, onProgress, signal } = args

  const callback = (progress: {
    totalBytesWritten: number
    totalBytesExpectedToWrite: number
  }) => {
    const expected =
      progress.totalBytesExpectedToWrite > 0
        ? progress.totalBytesExpectedToWrite
        : (expectedBytes ?? 0)
    if (expected > 0) {
      onProgress?.(Math.min(1, progress.totalBytesWritten / expected))
    }
  }

  const downloadResumable = resumeState?.resumeData
    ? FileSystem.createDownloadResumable(
        resumeState.url,
        resumeState.fileUri,
        resumeState.options ?? {},
        callback,
        resumeState.resumeData,
      )
    : FileSystem.createDownloadResumable(url, partialPath, {}, callback)

  let onAbort: (() => void) | undefined
  let pausedState: FileSystem.DownloadPauseState | null = null
  if (signal) {
    if (signal.aborted) {
      throw new DownloadError(DownloadErrorCode.ABORTED)
    }
    onAbort = () => {
      void downloadResumable.pauseAsync().then((state) => {
        pausedState = state
      })
    }
    signal.addEventListener('abort', onAbort)
  }

  try {
    const result = resumeState?.resumeData
      ? await downloadResumable.resumeAsync()
      : await downloadResumable.downloadAsync()
    if (signal?.aborted || pausedState) {
      return pausedState ?? (await downloadResumable.savable())
    }
    if (!result) {
      throw new DownloadError(DownloadErrorCode.FAILED)
    }
    return null
  } finally {
    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

async function executeDownload(params: DownloadGgufParams): Promise<void> {
  const partialPath = `${params.destPath}.partial`
  const transport = params.transport ?? runExpoTransport

  await ensureParentDirectory(params.destPath)

  let resumeState = await readResumeState(params.destPath)
  const partialInfo = await FileSystem.getInfoAsync(partialPath)
  if (!partialInfo.exists || !resumeState?.resumeData) {
    await clearPartialAndResume(partialPath, params.destPath)
    resumeState = null
  }

  try {
    const pausedState = await transport({
      url: params.url,
      partialPath,
      resumeState,
      onProgress: params.onProgress,
      signal: params.signal,
    })
    if (pausedState) {
      await writeResumeState(params.destPath, pausedState)
      throw new DownloadError(DownloadErrorCode.ABORTED)
    }
  } catch (err) {
    if (err instanceof DownloadError && err.code === DownloadErrorCode.ABORTED) {
      throw err
    }
    if (resumeState?.resumeData) {
      await clearPartialAndResume(partialPath, params.destPath)
      try {
        await transport({
          url: params.url,
          partialPath,
          resumeState: null,
          onProgress: params.onProgress,
          signal: params.signal,
        })
      } catch (retryErr) {
        if (retryErr instanceof DownloadError) throw retryErr
        throw new DownloadError(DownloadErrorCode.FAILED)
      }
    } else {
      if (err instanceof DownloadError) throw err
      throw new DownloadError(DownloadErrorCode.FAILED)
    }
  }

  await verifyPartial(partialPath, params.expectedBytes)
  await finalizeDownload(partialPath, params.destPath)
  params.onProgress?.(1)
}

/**
 * Downloads a GGUF to destPath. Writes to destPath + '.partial' first, then renames.
 * Resume uses Expo DownloadResumable state persisted as destPath + '.resume.json'.
 */
export async function downloadGguf(params: DownloadGgufParams): Promise<void> {
  await executeDownload(params)
}
