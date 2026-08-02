import {
  estimateRuntimeRamBytes,
  evaluateModelFit,
  FALLBACK_DEVICE_RAM_BYTES,
} from '../src/services/deviceCapability'
import {
  applyModelFilters,
  parseQuantFamily,
  sortModels,
} from '../src/services/modelCatalog'
import type { HubGgufFile } from '../src/domain/types'

test('estimateRuntimeRamBytes adds overhead and KV headroom', () => {
  const file = 1_000_000_000
  const est = estimateRuntimeRamBytes(file)
  expect(est).toBeGreaterThan(file)
  expect(est).toBe(Math.ceil(file * 1.35 + 256 * 1024 * 1024))
})

test('evaluateModelFit rejects models larger than usable RAM', () => {
  const device = 4 * 1024 * 1024 * 1024
  const tiny = evaluateModelFit(200 * 1024 * 1024, device)
  expect(tiny.fits).toBe(true)
  const huge = evaluateModelFit(6 * 1024 * 1024 * 1024, device)
  expect(huge.fits).toBe(false)
  expect(huge.usableRamBytes).toBe(Math.floor(device * 0.8))
})

test('fallback device RAM is 4 GiB constant', () => {
  expect(FALLBACK_DEVICE_RAM_BYTES).toBe(4 * 1024 * 1024 * 1024)
})

test('parseQuantFamily reads filename', () => {
  expect(parseQuantFamily('model-Q4_K_M.gguf')).toBe('Q4')
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
]

test('applyModelFilters quant and fitsDeviceOnly', () => {
  const device = 4 * 1024 * 1024 * 1024
  const q4 = applyModelFilters(sample, { quant: 'Q4' }, device)
  expect(q4).toHaveLength(1)
  expect(q4[0].displayName).toBe('small')

  const fits = applyModelFilters(sample, { fitsDeviceOnly: true }, device)
  expect(fits.every((f) => evaluateModelFit(f.sizeBytes, device).fits)).toBe(true)
  expect(fits.find((f) => f.displayName === 'big')).toBeUndefined()
})

test('sortModels by downloads and size', () => {
  expect(sortModels(sample, 'downloads')[0].displayName).toBe('big')
  expect(sortModels(sample, 'sizeAsc')[0].displayName).toBe('small')
  expect(sortModels(sample, 'name')[0].displayName).toBe('big')
})
