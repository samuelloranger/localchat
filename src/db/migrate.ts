import type { SQLiteDatabase } from 'expo-sqlite'

import { DATABASE_VERSION, SCHEMA_SQL } from './schema'

const MIGRATION_V2_SQL = `
DELETE FROM models;

CREATE TABLE IF NOT EXISTS messages_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'streaming', 'error'))
);

INSERT INTO messages_v2 (id, conversation_id, role, content, created_at, status)
SELECT id, conversation_id, role, content, created_at, status FROM messages;

DROP TABLE messages;
ALTER TABLE messages_v2 RENAME TO messages;

DROP TABLE IF EXISTS models;

CREATE TABLE models (
  id TEXT PRIMARY KEY NOT NULL,
  repo_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  local_path TEXT NOT NULL UNIQUE,
  downloaded_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
`

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;')

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  let current = row?.user_version ?? 0

  while (current < DATABASE_VERSION) {
    const next = current + 1

    if (next === 1) {
      await db.execAsync(SCHEMA_SQL)
    } else if (next === 2) {
      await db.execAsync(MIGRATION_V2_SQL)
    }

    await db.execAsync(`PRAGMA user_version = ${next}`)
    current = next
  }
}
