import type { SQLiteDatabase } from 'expo-sqlite'
import * as FileSystem from 'expo-file-system/legacy'

import type { InstalledModel } from '@/src/domain/types'
import { evaluateModelFit } from '@/src/services/deviceCapability'
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
    localPath: row.local_path,
    downloadedAt: row.downloaded_at,
    lastUsedAt: row.last_used_at,
  }
}

export function modelIdFor(repoId: string, filename: string): string {
  return `${repoId}/${filename}`
}

export function modelFilePath(modelId: string): string {
  const safe = modelId.replace(/[^a-zA-Z0-9._-]+/g, '__')
  const base = FileSystem.documentDirectory ?? 'file:///tmp/'
  return `${base}models/${safe}.gguf`
}

export async function listInstalled(db: SQLiteDatabase): Promise<InstalledModel[]> {
  const rows = await db.getAllAsync<ModelRow>(
    `SELECT id, repo_id, filename, display_name, size_bytes, local_path, downloaded_at, last_used_at
     FROM models
     ORDER BY downloaded_at DESC`,
  )
  return rows.map(mapModel)
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
    model.localPath,
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
    await FileSystem.deleteAsync(row.local_path, { idempotent: true })
    await FileSystem.deleteAsync(`${row.local_path}.partial`, { idempotent: true })
  }
  await db.runAsync(`DELETE FROM models WHERE id = ?`, id)
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
  const fit = evaluateModelFit(params.sizeBytes)
  if (!fit.fits) {
    throw new Error(
      `MODEL_TOO_LARGE: needs ~${fit.estimatedRamBytes} bytes, device usable ${fit.usableRamBytes}`,
    )
  }

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
