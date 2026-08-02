import { buildContext, CONTEXT_TOKEN_BUDGET } from '../src/chat/buildContext'
import { N_CTX, N_PREDICT, CONTEXT_SAFETY_MARGIN } from '../src/services/inference'

function msg(id: string, role: 'user' | 'assistant', content: string, status: 'complete' | 'streaming' = 'complete') {
  return {
    id,
    conversationId: 'c1',
    role,
    content,
    createdAt: 0,
    status,
  }
}

test('context token budget derives from inference constants', () => {
  expect(CONTEXT_TOKEN_BUDGET).toBe(N_CTX - N_PREDICT - CONTEXT_SAFETY_MARGIN)
})

test('buildContext stops adding messages when budget exceeded', () => {
  const long = 'x'.repeat(CONTEXT_TOKEN_BUDGET * 4)
  const messages = [
    msg('1', 'user', long),
    msg('2', 'assistant', 'short reply'),
    msg('3', 'user', 'latest question'),
  ]
  const ctx = buildContext(messages)
  expect(ctx.some((m) => m.content === long)).toBe(false)
  expect(ctx[ctx.length - 1]?.content).toBe('latest question')
})

test('buildContext includes complete assistant messages', () => {
  const messages = [msg('1', 'user', 'hi'), msg('2', 'assistant', 'hello')]
  expect(buildContext(messages)).toHaveLength(2)
})
