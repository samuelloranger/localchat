import { migrateDbIfNeeded } from '../src/db/migrate'
import * as chat from '../src/services/chatStore'
import { openMemoryDatabase } from './helpers/memoryDb'

async function openMem() {
  const db = await openMemoryDatabase()
  await migrateDbIfNeeded(db)
  return db
}

test('createConversation then list', async () => {
  const db = await openMem()
  const c = await chat.createConversation(db, { modelId: 'repo/file.gguf' })
  expect(c.title).toBeTruthy()
  const list = await chat.listConversations(db)
  expect(list).toHaveLength(1)
  expect(list[0].id).toBe(c.id)
})

test('appendMessage cascade delete', async () => {
  const db = await openMem()
  const c = await chat.createConversation(db, { modelId: 'm' })
  await chat.appendMessage(db, {
    conversationId: c.id,
    role: 'user',
    content: 'hi',
    status: 'complete',
  })
  await chat.deleteConversation(db, c.id)
  expect(await chat.getMessages(db, c.id)).toHaveLength(0)
  expect(await chat.listConversations(db)).toHaveLength(0)
})

test('updateMessage streaming to complete', async () => {
  const db = await openMem()
  const c = await chat.createConversation(db, { modelId: 'm' })
  const m = await chat.appendMessage(db, {
    conversationId: c.id,
    role: 'assistant',
    content: '',
    status: 'streaming',
  })
  await chat.updateMessage(db, m.id, { content: 'hello', status: 'complete' })
  const msgs = await chat.getMessages(db, c.id)
  expect(msgs[0].content).toBe('hello')
  expect(msgs[0].status).toBe('complete')
})
