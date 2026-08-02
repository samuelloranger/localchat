import { DatabaseSync } from 'node:sqlite'

import type { SQLiteDatabase } from 'expo-sqlite'

export async function openMemoryDatabase(): Promise<SQLiteDatabase> {
  const db = new DatabaseSync(':memory:')

  const api = {
    async execAsync(source: string) {
      db.exec(source)
    },
    async runAsync(source: string, ...params: unknown[]) {
      const result = db.prepare(source).run(...(params as never[]))
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: result.changes,
      }
    },
    async getFirstAsync<T>(source: string, ...params: unknown[]) {
      return (db.prepare(source).get(...(params as never[])) as T | undefined) ?? null
    },
    async getAllAsync<T>(source: string, ...params: unknown[]) {
      return db.prepare(source).all(...(params as never[])) as T[]
    },
  }

  return api as unknown as SQLiteDatabase
}
