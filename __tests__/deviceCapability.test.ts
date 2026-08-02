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

test('iOS budget is smaller than Android for the same totalMemory', () => {
  const ram = 6 * 1024 * 1024 * 1024
  const iosBudget = Math.floor(ram * IOS_RAM_USABLE_FRACTION)
  const androidBudget = Math.floor(ram * ANDROID_RAM_USABLE_FRACTION)
  expect(iosBudget).toBeLessThan(androidBudget)
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
