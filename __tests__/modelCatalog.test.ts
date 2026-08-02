import { evaluateModelFit } from '../src/services/deviceCapability'
import {
  applyModelFilters,
  parseQuantFamily,
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
