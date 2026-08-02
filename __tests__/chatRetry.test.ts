import { migrateDbIfNeeded } from '../src/db/migrate'
import * as chatStore from '../src/services/chatStore'
import { openMemoryDatabase } from './helpers/memoryDb'

async function openMem() {
  const db = await openMemoryDatabase()
  await migrateDbIfNeeded(db)
  return db
}

test('retry flow resets assistant in place without duplicating user message', async () => {
  const db = await openMem()
  const convo = await chatStore.createConversation(db, { modelId: 'm1', title: 'Test' })

  await chatStore.appendMessage(db, {
    id: 'user-1',
    conversationId: convo.id,
    role: 'user',
    content: 'Hello',
    status: 'complete',
  })
  const assistant = await chatStore.appendMessage(db, {
    id: 'assistant-1',
    conversationId: convo.id,
    role: 'assistant',
    content: 'partial',
    status: 'error',
  })

  await chatStore.updateMessage(db, assistant.id, { content: '', status: 'streaming' })

  const messages = await chatStore.getMessages(db, convo.id)
  expect(messages).toHaveLength(2)
  expect(messages.filter((m) => m.role === 'user')).toHaveLength(1)
  expect(messages.find((m) => m.id === assistant.id)?.status).toBe('streaming')
  expect(messages.find((m) => m.id === assistant.id)?.content).toBe('')
})
