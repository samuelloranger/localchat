export function nextRangeHeader(partialBytes: number): string | undefined {
  if (partialBytes <= 0) return undefined
  return `bytes=${partialBytes}-`
}

export type DownloadGgufParams = {
  url: string
  destPath: string
  expectedBytes?: number
  onProgress?: (progress: number) => void
  signal?: AbortSignal
  /** Test seam */
  download?: (args: {
    url: string
    destPath: string
    headers?: Record<string, string>
    onProgress?: (progress: number) => void
    signal?: AbortSignal
  }) => Promise<void>
}

/**
 * Downloads a GGUF to destPath. Writes to destPath + '.partial' first, then renames.
 * Resume uses HTTP Range when a partial file already exists.
 */
export async function downloadGguf(params: DownloadGgufParams): Promise<void> {
  const partialPath = `${params.destPath}.partial`

  if (params.download) {
    const FileSystem = await import('expo-file-system/legacy')
    const info = await FileSystem.getInfoAsync(partialPath)
    const existingBytes = info.exists && 'size' in info ? Number(info.size ?? 0) : 0
    const range = nextRangeHeader(existingBytes)
    const headers = range ? { Range: range } : undefined

    await params.download({
      url: params.url,
      destPath: partialPath,
      headers,
      onProgress: params.onProgress,
      signal: params.signal,
    })

    await FileSystem.deleteAsync(params.destPath, { idempotent: true })
    await FileSystem.moveAsync({ from: partialPath, to: params.destPath })
    params.onProgress?.(1)
    return
  }

  const FileSystem = await import('expo-file-system/legacy')
  const destDir = params.destPath.slice(0, params.destPath.lastIndexOf('/'))
  if (destDir) {
    const dirInfo = await FileSystem.getInfoAsync(destDir)
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true })
    }
  }

  const info = await FileSystem.getInfoAsync(partialPath)
  const existingBytes = info.exists && 'size' in info ? Number(info.size ?? 0) : 0
  const range = nextRangeHeader(existingBytes)

  const callback = (progress: {
    totalBytesWritten: number
    totalBytesExpectedToWrite: number
  }) => {
    const expected =
      progress.totalBytesExpectedToWrite > 0
        ? progress.totalBytesExpectedToWrite
        : (params.expectedBytes ?? 0)
    if (expected > 0) {
      const written = existingBytes + progress.totalBytesWritten
      const total = range ? existingBytes + expected : expected
      params.onProgress?.(Math.min(1, written / total))
    }
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    params.url,
    partialPath,
    range ? { headers: { Range: range } } : {},
    callback,
  )

  if (params.signal) {
    const onAbort = () => {
      void downloadResumable.pauseAsync()
    }
    if (params.signal.aborted) {
      throw new Error('DOWNLOAD_ABORTED')
    }
    params.signal.addEventListener('abort', onAbort, { once: true })
  }

  const result = await downloadResumable.downloadAsync()
  if (!result) {
    throw new Error('DOWNLOAD_FAILED')
  }

  await FileSystem.deleteAsync(params.destPath, { idempotent: true })
  await FileSystem.moveAsync({ from: partialPath, to: params.destPath })
  params.onProgress?.(1)
}
