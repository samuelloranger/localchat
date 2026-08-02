let mockTotalMemory: number | null = 4 * 1024 * 1024 * 1024

jest.mock('expo-device', () => ({
  get totalMemory() {
    return mockTotalMemory
  },
}))

import {
  ANDROID_RAM_USABLE_FRACTION,
  IOS_RAM_USABLE_FRACTION,
  estimateRuntimeRamBytes,
  evaluateModelFit,
  FALLBACK_DEVICE_RAM_BYTES,
  getDeviceRamBytes,
  getDeviceRamUsableFraction,
} from '../src/services/deviceCapability'
import { N_CTX } from '../src/services/inference'

test('estimateRuntimeRamBytes adds mmap overhead and n_ctx-derived KV', () => {
  const file = 1_000_000_000
  const est = estimateRuntimeRamBytes(file, N_CTX)
  expect(est).toBeGreaterThan(file)
  expect(est).toBe(Math.ceil(file * 1.15 + N_CTX * ((256 * 1024 * 1024) / 2048)))
})

test('evaluateModelFit rejects models larger than usable RAM', () => {
  const ram = 4 * 1024 * 1024 * 1024
  const tiny = evaluateModelFit(200 * 1024 * 1024, ram)
  expect(tiny.fits).toBe(true)
  const huge = evaluateModelFit(6 * 1024 * 1024 * 1024, ram)
  expect(huge.fits).toBe(false)
  expect(huge.usableRamBytes).toBe(Math.floor(ram * getDeviceRamUsableFraction()))
})

test('platform usable fractions are 85%', () => {
  expect(IOS_RAM_USABLE_FRACTION).toBe(0.85)
  expect(ANDROID_RAM_USABLE_FRACTION).toBe(0.85)
  expect(getDeviceRamUsableFraction()).toBe(0.85)
})

test('fallback device RAM is conservative 2 GiB', () => {
  expect(FALLBACK_DEVICE_RAM_BYTES).toBe(2 * 1024 * 1024 * 1024)
})

test('getDeviceRamBytes uses fallback when totalMemory is null or zero', () => {
  mockTotalMemory = null
  expect(getDeviceRamBytes()).toBe(FALLBACK_DEVICE_RAM_BYTES)

  mockTotalMemory = 0
  expect(getDeviceRamBytes()).toBe(FALLBACK_DEVICE_RAM_BYTES)

  mockTotalMemory = 4 * 1024 * 1024 * 1024
  expect(getDeviceRamBytes()).toBe(4 * 1024 * 1024 * 1024)
})
