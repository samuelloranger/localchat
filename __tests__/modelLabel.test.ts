import { formatModelLabel, formatProvenance } from '../src/chat/modelLabel'

test('formatModelLabel drops the repo prefix, extension and quant marker', () => {
  expect(
    formatModelLabel('Dolphin3.0-Llama3.2-3B-GGUF/Dolphin3.0-Llama3.2-3B-Q4_K_M.gguf'),
  ).toBe('Dolphin3.0-Llama3.2-3B')
  expect(formatModelLabel('org/Huihui-Qwen3.5-4B-abliterated.i1-IQ4_XS.gguf')).toBe(
    'Huihui-Qwen3.5-4B-abliterated',
  )
  expect(formatModelLabel('org/model-BF16.gguf')).toBe('model')
})

test('formatModelLabel never returns an empty label', () => {
  expect(formatModelLabel('org/Q4_K_M.gguf')).toBe('Q4_K_M')
  expect(formatModelLabel('plain')).toBe('plain')
})

test('formatProvenance names the model on the first reply only', () => {
  expect(formatProvenance('Qwen3.5-4B', 11.42, true)).toBe('Qwen3.5-4B · 11.4 tok/s')
  expect(formatProvenance('Qwen3.5-4B', 11.42, false)).toBe('11.4 tok/s')
  expect(formatProvenance('Qwen3.5-4B', null, true)).toBe('Qwen3.5-4B')
})

test('formatProvenance says nothing when there is nothing to report', () => {
  expect(formatProvenance('Qwen3.5-4B', null, false)).toBeNull()
  expect(formatProvenance('Qwen3.5-4B', 0, false)).toBeNull()
  expect(formatProvenance('Qwen3.5-4B', Number.NaN, false)).toBeNull()
})
