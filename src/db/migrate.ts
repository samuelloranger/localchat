import type { SQLiteDatabase } from 'expo-sqlite'

import { DATABASE_VERSION, SCHEMA_SQL } from './schema'

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;')

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const current = row?.user_version ?? 0
  if (current >= DATABASE_VERSION) {
    return
  }

  if (current === 0) {
    await db.execAsync(SCHEMA_SQL)
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`)
}
