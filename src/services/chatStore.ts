import type { SQLiteDatabase } from 'expo-sqlite'

import type { Conversation, Message, MessageRole, MessageStatus } from '@/src/domain/types'

function newId(): string {
  return globalThis.crypto.randomUUID()
}

type ConversationRow = {
  id: string
  title: string
  model_id: string
  created_at: number
  updated_at: number
}

type MessageRow = {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  created_at: number
  status: MessageStatus
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    modelId: row.model_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    status: row.status,
  }
}

export async function createConversation(
  db: SQLiteDatabase,
  params: { modelId: string; title?: string },
): Promise<Conversation> {
  const now = Date.now()
  const conversation: Conversation = {
    id: newId(),
    title: params.title ?? 'New chat',
    modelId: params.modelId,
    createdAt: now,
    updatedAt: now,
  }
  await db.runAsync(
    `INSERT INTO conversations (id, title, model_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    conversation.id,
    conversation.title,
    conversation.modelId,
    conversation.createdAt,
    conversation.updatedAt,
  )
  return conversation
}

export async function listConversations(db: SQLiteDatabase): Promise<Conversation[]> {
  const rows = await db.getAllAsync<ConversationRow>(
    `SELECT id, title, model_id, created_at, updated_at
     FROM conversations
     ORDER BY updated_at DESC`,
  )
  return rows.map(mapConversation)
}

export async function deleteConversation(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM conversations WHERE id = ?`, id)
}

export async function getMessages(
  db: SQLiteDatabase,
  conversationId: string,
): Promise<Message[]> {
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT id, conversation_id, role, content, created_at, status
     FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC`,
    conversationId,
  )
  return rows.map(mapMessage)
}

export async function appendMessage(
  db: SQLiteDatabase,
  msg: Omit<Message, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): Promise<Message> {
  const message: Message = {
    id: msg.id ?? newId(),
    conversationId: msg.conversationId,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt ?? Date.now(),
    status: msg.status,
  }
  await db.runAsync(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    message.id,
    message.conversationId,
    message.role,
    message.content,
    message.createdAt,
    message.status,
  )
  await db.runAsync(
    `UPDATE conversations SET updated_at = ? WHERE id = ?`,
    message.createdAt,
    message.conversationId,
  )
  return message
}

export async function updateMessage(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<Pick<Message, 'content' | 'status'>>,
): Promise<void> {
  if (patch.content !== undefined && patch.status !== undefined) {
    await db.runAsync(`UPDATE messages SET content = ?, status = ? WHERE id = ?`, patch.content, patch.status, id)
    return
  }
  if (patch.content !== undefined) {
    await db.runAsync(`UPDATE messages SET content = ? WHERE id = ?`, patch.content, id)
    return
  }
  if (patch.status !== undefined) {
    await db.runAsync(`UPDATE messages SET status = ? WHERE id = ?`, patch.status, id)
  }
}

export async function setConversationTitle(
  db: SQLiteDatabase,
  id: string,
  title: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`,
    title,
    Date.now(),
    id,
  )
}

export async function setConversationModel(
  db: SQLiteDatabase,
  id: string,
  modelId: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE conversations SET model_id = ?, updated_at = ? WHERE id = ?`,
    modelId,
    Date.now(),
    id,
  )
}
