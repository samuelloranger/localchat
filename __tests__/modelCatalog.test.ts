import { evaluateModelFit } from '../src/services/deviceCapability'
import {
  applyModelFilters,
  isNonModelGguf,
  isShardedGguf,
  parseQuantFamily,
  quantPreferenceRank,
  selectRepoFiles,
  sortModels,
} from '../src/services/modelCatalog'
import type { HubGgufFile } from '../src/domain/types'

test('parseQuantFamily reads common filename shapes', () => {
  expect(parseQuantFamily('model-Q4_K_M.gguf')).toBe('Q4')
  expect(parseQuantFamily('model-q4.gguf')).toBe('Q4')
  expect(parseQuantFamily('Model.Q4.gguf')).toBe('Q4')
  expect(parseQuantFamily('model-IQ2_XXS.gguf')).toBe('IQ')
  expect(parseQuantFamily('model-f16.gguf')).toBe('F16')
})

const sample: HubGgufFile[] = [
  {
    repoId: 'a/b',
    filename: 'small-Q4_K_M.gguf',
    displayName: 'small',
    sizeBytes: 100,
    quant: 'Q4',
    downloads: 10,
    lastModified: 1,
  },
  {
    repoId: 'a/c',
    filename: 'big-Q8_0.gguf',
    displayName: 'big',
    sizeBytes: 5 * 1024 * 1024 * 1024,
    quant: 'Q8',
    downloads: 50,
    lastModified: 9,
  },
  {
    repoId: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    filename: 'Llama-3.2-3B-Q4_K_M.gguf',
    displayName: 'llama',
    sizeBytes: 2_000_000_000,
    quant: 'Q4',
    downloads: 100,
    lastModified: 2,
  },
]

test('applyModelFilters quant, fitsDeviceOnly, and tokenised query', () => {
  const device = 4 * 1024 * 1024 * 1024
  const q4 = applyModelFilters(sample, { quant: 'Q4' }, device)
  expect(q4).toHaveLength(2)

  const fits = applyModelFilters(sample, { fitsDeviceOnly: true }, device)
  expect(fits.every((f) => evaluateModelFit(f.sizeBytes, device).fits)).toBe(true)
  expect(fits.find((f) => f.displayName === 'big')).toBeUndefined()

  const tokens = applyModelFilters(sample, { query: 'llama 3.2' }, device)
  expect(tokens).toHaveLength(1)
  expect(tokens[0].repoId).toContain('Llama-3.2')
})

test('sortModels by downloads tie-breaks on size ascending', () => {
  const tied: HubGgufFile[] = [
    { ...sample[0], downloads: 50, sizeBytes: 500, displayName: 'b' },
    { ...sample[1], downloads: 50, sizeBytes: 100, displayName: 'a' },
  ]
  expect(sortModels(tied, 'downloads')[0].sizeBytes).toBe(100)
  expect(sortModels(sample, 'sizeAsc')[0].displayName).toBe('small')
  expect(sortModels(sample, 'name')[0].displayName).toBe('big')
})

function repoFile(filename: string, sizeBytes: number): HubGgufFile {
  return {
    repoId: 'org/Model-GGUF',
    filename,
    displayName: filename,
    sizeBytes,
  }
}

test('quantPreferenceRank puts Q4_K_M ahead of the low quants', () => {
  expect(quantPreferenceRank('m-Q4_K_M.gguf')).toBeLessThan(quantPreferenceRank('m-Q4_K_S.gguf'))
  expect(quantPreferenceRank('m-Q4_K_S.gguf')).toBeLessThan(quantPreferenceRank('m-IQ3_XS.gguf'))
  expect(quantPreferenceRank('m-IQ3_XS.gguf')).toBeLessThan(quantPreferenceRank('m-IQ2_M.gguf'))
  expect(quantPreferenceRank('m-IQ2_M.gguf')).toBeLessThan(quantPreferenceRank('m-Q2_K.gguf'))
  expect(quantPreferenceRank('m-Q2_K.gguf')).toBeLessThan(quantPreferenceRank('m-IQ1_S.gguf'))
})

test('isShardedGguf recognises split files', () => {
  expect(isShardedGguf('model-00001-of-00003.gguf')).toBe(true)
  expect(isShardedGguf('model-Q4_K_M.gguf')).toBe(false)
})

// Regression: the repo cap used to sort by size ascending, so a repo was always
// represented by its four smallest files — which are the unusable Q2/IQ2 ones.
// Q4_K_M was structurally unreachable, and the Q4 chip filtered a list it had
// already been removed from.
test('selectRepoFiles keeps the useful quants, not the smallest files', () => {
  const listed = [
    repoFile('m-IQ2_M.gguf', 1_172_000_000),
    repoFile('m-Q2_K.gguf', 1_301_000_000),
    repoFile('m-Q2_K_L.gguf', 1_392_000_000),
    repoFile('m-IQ3_XS.gguf', 1_408_000_000),
    repoFile('m-Q4_K_M.gguf', 2_020_000_000),
    repoFile('m-Q6_K.gguf', 2_640_000_000),
  ]

  const top4 = selectRepoFiles(listed, 4).map((f) => f.filename)
  expect(top4[0]).toBe('m-Q4_K_M.gguf')
  expect(top4).toContain('m-Q6_K.gguf')
  expect(top4).not.toContain('m-Q2_K.gguf')

  // A generous cap keeps everything, so the Q2/IQ chips still have rows to show.
  expect(selectRepoFiles(listed, 12)).toHaveLength(6)
})

test('selectRepoFiles tie-breaks equal quants on size ascending', () => {
  const listed = [repoFile('b-Q4_K_M.gguf', 900), repoFile('a-Q4_K_M.gguf', 100)]
  expect(selectRepoFiles(listed, 2)[0].sizeBytes).toBe(100)
})

// A projector is a fraction of its model's size, so it slips past every size
// and RAM filter and looks like an unusually light model. Loading one produces
// no usable context.
test('isNonModelGguf rejects projectors, adapters and tokenizer dumps', () => {
  expect(isNonModelGguf('mmproj-Qwen3.5-4B-Uncensored-BF16.gguf')).toBe(true)
  expect(isNonModelGguf('mmproj-model-f16.gguf')).toBe(true)
  expect(isNonModelGguf('Qwen3.5-4B-lora-writing.gguf')).toBe(true)
  expect(isNonModelGguf('model-adapter-v2.gguf')).toBe(true)
  expect(isNonModelGguf('llama-3.2-vocab.gguf')).toBe(true)
  expect(isNonModelGguf('model.tokenizer.gguf')).toBe(true)
})

test('isNonModelGguf keeps real model files', () => {
  expect(isNonModelGguf('Qwen3.5-4B-Uncensored-Q4_K_M.gguf')).toBe(false)
  expect(isNonModelGguf('Dolphin3.0-Llama3.2-3B-IQ3_XS.gguf')).toBe(false)
  // "adapter"/"lora" only count as separators-delimited tokens, so a model
  // whose name merely contains the letters is not dropped.
  expect(isNonModelGguf('Adaptive-Reasoner-3B-Q4_K_M.gguf')).toBe(false)
  expect(isNonModelGguf('Explorator-7B-Q4_K_M.gguf')).toBe(false)
})
