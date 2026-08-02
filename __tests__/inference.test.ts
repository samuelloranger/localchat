jest.mock('llama.rn', () => {
  const completion = jest.fn(async (_p: unknown, cb: (d: { token: string }) => void) => {
    cb({ token: 'Hi' })
    return { text: 'Hi', content: 'Hi', tokens_predicted: 1, timings: {} }
  })
  const stopCompletion = jest.fn(async () => {})
  const release = jest.fn(async () => {})
  return {
    initLlama: jest.fn(async () => ({ completion, stopCompletion, release, gpu: false })),
    releaseAllLlama: jest.fn(async () => {}),
  }
})

import { initLlama } from 'llama.rn'

import * as inference from '../src/services/inference'

test('completeChat streams tokens after loadModel', async () => {
  await inference.loadModel('/tmp/m.gguf')
  expect(initLlama).toHaveBeenCalled()
  const tokens: string[] = []
  const { text } = await inference.completeChat({
    messages: [{ role: 'user', content: 'hi' }],
    onToken: (t) => tokens.push(t),
  })
  expect(tokens.join('')).toContain('Hi')
  expect(text).toBe('Hi')
})

test('completeChat without load throws NO_MODEL_LOADED', async () => {
  await inference.unloadModel()
  await expect(
    inference.completeChat({ messages: [], onToken: () => {} }),
  ).rejects.toThrow('NO_MODEL_LOADED')
})
