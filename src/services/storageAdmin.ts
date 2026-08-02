import type { SQLiteDatabase } from 'expo-sqlite'
import * as FileSystem from 'expo-file-system/legacy'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { modelsDirectory } from '@/src/services/modelStore'

async function dirSizeBytes(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri)
  if (!info.exists) return 0
  if (!info.isDirectory) {
    return 'size' in info ? Number(info.size ?? 0) : 0
  }
  const entries = await FileSystem.readDirectoryAsync(uri)
  let total = 0
  for (const name of entries) {
    total += await dirSizeBytes(`${uri}/${name}`)
  }
  return total
}

export async function getModelsStorageBytes(): Promise<number> {
  return dirSizeBytes(modelsDirectory())
}

export async function clearIncompleteDownloads(): Promise<number> {
  const dir = modelsDirectory()
  const info = await FileSystem.getInfoAsync(dir)
  if (!info.exists || !info.isDirectory) return 0
  const entries = await FileSystem.readDirectoryAsync(dir)
  let removed = 0
  for (const name of entries) {
    if (name.endsWith('.partial') || name.endsWith('.resume.json')) {
      await FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true })
      removed++
    }
  }
  return removed
}

export async function deleteAllAppData(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM models;
  `)
  const dir = modelsDirectory()
  const info = await FileSystem.getInfoAsync(dir)
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true })
  }
  const keys = await AsyncStorage.getAllKeys()
  const prefKeys = keys.filter((k) => k.startsWith('prefs.') || k.startsWith('hub.cache'))
  await Promise.all(prefKeys.map((k) => AsyncStorage.removeItem(k)))
}
