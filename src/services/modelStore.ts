import type { SQLiteDatabase } from 'expo-sqlite'
import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'

import type { InstalledModel } from '@/src/domain/types'
import { type FitResult } from '@/src/services/deviceCapability'
import { downloadGguf } from '@/src/services/downloadManager'
import { downloadUrl } from '@/src/services/hfHub'

type ModelRow = {
  id: string
  repo_id: string
  filename: string
  display_name: string
  size_bytes: number
  local_path: string
  downloaded_at: number
  last_used_at: number | null
}

function mapModel(row: ModelRow): InstalledModel {
  return {
    id: row.id,
    repoId: row.repo_id,
    filename: row.filename,
    displayName: row.display_name,
    sizeBytes: row.size_bytes,
    // Callers need somewhere to read from, so hand out a resolved absolute
    // path. The stored value stays relative — see resolveModelPath.
    localPath: resolveModelPath(row.local_path),
    downloadedAt: row.downloaded_at,
    lastUsedAt: row.last_used_at,
  }
}

export function modelIdFor(repoId: string, filename: string): string {
  return `${repoId}/${filename}`
}

/** Models live outside iCloud-backed Documents (Application Support on iOS). */
export function modelsDirectory(): string {
  const base = FileSystem.documentDirectory ?? 'file:///tmp/'
  if (Platform.OS === 'ios') {
    const dir = base.replace(/\/Documents\/?$/, '/Library/Application Support/LocalChat/models/')
    return dir.endsWith('/') ? dir : `${dir}/`
  }
  if (base.includes('/Documents/')) {
    return base.replace('/Documents/', '/models/')
  }
  return `${base}../models/`
}

/** Stable, filesystem-safe file name for a model. Never contains a directory. */
export function modelFileName(modelId: string): string {
  return `${modelId.replace(/[^a-zA-Z0-9._-]+/g, '__')}.gguf`
}

export function modelFilePath(modelId: string): string {
  return `${modelsDirectory()}${modelFileName(modelId)}`
}

/**
 * Turn whatever is in models.local_path into a path that is valid right now.
 *
 * iOS app containers are addressed as
 * /var/mobile/Containers/Data/Application/<UUID>/… and that UUID is
 * regenerated on app update even though the data inside is preserved. An
 * absolute path written before an update therefore points nowhere afterwards —
 * which, combined with the prune in listInstalled, deleted every installed
 * model on the first launch after each release.
 *
 * So only the file name is persisted, and the directory is resolved at read
 * time. Rows written by older builds still hold an absolute path; those are
 * recognised here and reduced to their file name.
 */
export function resolveModelPath(stored: string): string {
  const name = stored.split('/').pop() ?? stored
  return `${modelsDirectory()}${name}`
}

/** True for a legacy row that still holds a full path. */
export function isLegacyAbsolutePath(stored: string): boolean {
  return stored.includes('/')
}

export async function listInstalled(db: SQLiteDatabase): Promise<InstalledModel[]> {
  const rows = await db.getAllAsync<ModelRow>(
    `SELECT id, repo_id, filename, display_name, size_bytes, local_path, downloaded_at, last_used_at
     FROM models
     ORDER BY downloaded_at DESC`,
  )
  const installed: InstalledModel[] = []
  for (const row of rows) {
    const resolved = resolveModelPath(row.local_path)
    const info = await FileSystem.getInfoAsync(resolved)

    if (!info.exists) {
      // The file is genuinely gone — not merely addressed by a stale container
      // path, since `resolved` is always rebuilt against the current directory.
      await db.runAsync(`DELETE FROM models WHERE id = ?`, row.id)
      continue
    }

    // Heal rows written before paths were stored relative, so the rewrite
    // happens once instead of on every read.
    if (isLegacyAbsolutePath(row.local_path)) {
      const name = row.local_path.split('/').pop() ?? row.local_path
      await db.runAsync(`UPDATE models SET local_path = ? WHERE id = ?`, name, row.id)
    }

    installed.push(mapModel(row))
  }
  return installed
}

export async function recordInstalled(
  db: SQLiteDatabase,
  model: InstalledModel,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO models
      (id, repo_id, filename, display_name, size_bytes, local_path, downloaded_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    model.id,
    model.repoId,
    model.filename,
    model.displayName,
    model.sizeBytes,
    // Store the file name only. InstalledModel.localPath is absolute because
    // callers need to read the file, but an absolute path in the database goes
    // stale the next time iOS rebuilds the container path.
    model.localPath.split('/').pop() ?? model.localPath,
    model.downloadedAt,
    model.lastUsedAt,
  )
}

export async function touchLastUsed(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`UPDATE models SET last_used_at = ? WHERE id = ?`, Date.now(), id)
}

export async function removeInstalled(db: SQLiteDatabase, id: string): Promise<void> {
  const row = await db.getFirstAsync<ModelRow>(
    `SELECT id, repo_id, filename, display_name, size_bytes, local_path, downloaded_at, last_used_at
     FROM models WHERE id = ?`,
    id,
  )
  if (row) {
    const resolved = resolveModelPath(row.local_path)
    await FileSystem.deleteAsync(resolved, { idempotent: true })
    await FileSystem.deleteAsync(`${resolved}.partial`, { idempotent: true })
    await FileSystem.deleteAsync(`${resolved}.resume.json`, { idempotent: true })
  }
  await db.runAsync(`DELETE FROM models WHERE id = ?`, id)
}

export class ModelTooLargeError extends Error {
  readonly fit: FitResult

  constructor(fit: FitResult) {
    super(
      `MODEL_TOO_LARGE: needs ~${fit.estimatedRamBytes} bytes, device usable ${fit.usableRamBytes}`,
    )
    this.name = 'ModelTooLargeError'
    this.fit = fit
  }
}

export async function installFromHub(
  db: SQLiteDatabase,
  params: {
    repoId: string
    filename: string
    displayName: string
    sizeBytes: number
    onProgress?: (p: number) => void
    signal?: AbortSignal
  },
): Promise<InstalledModel> {
  const id = modelIdFor(params.repoId, params.filename)
  const localPath = modelFilePath(id)
  const url = downloadUrl(params.repoId, params.filename)

  await downloadGguf({
    url,
    destPath: localPath,
    expectedBytes: params.sizeBytes,
    onProgress: params.onProgress,
    signal: params.signal,
  })

  const model: InstalledModel = {
    id,
    repoId: params.repoId,
    filename: params.filename,
    displayName: params.displayName,
    sizeBytes: params.sizeBytes,
    localPath,
    downloadedAt: Date.now(),
    lastUsedAt: null,
  }
  await recordInstalled(db, model)
  return model
}
