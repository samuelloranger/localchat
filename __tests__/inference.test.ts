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

test('loadModel retries with n_gpu_layers 0 after GPU init failure', async () => {
  const initLlamaMock = initLlama as jest.Mock
  initLlamaMock.mockReset()
  initLlamaMock
    .mockRejectedValueOnce(new Error('GPU init failed'))
    .mockResolvedValueOnce({
      completion: jest.fn(),
      stopCompletion: jest.fn(),
      release: jest.fn(),
      gpu: false,
    })

  await inference.unloadModel()
  await inference.loadModel('/tmp/gpu-fail.gguf')

  expect(initLlamaMock).toHaveBeenCalledTimes(2)
  expect(initLlamaMock.mock.calls[0][0].n_gpu_layers).toBe(99)
  expect(initLlamaMock.mock.calls[1][0].n_gpu_layers).toBe(0)
  expect(initLlamaMock.mock.calls[1][0].use_mmap).toBe(true)
})
