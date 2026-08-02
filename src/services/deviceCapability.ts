import * as Device from 'expo-device'

/** Leave headroom for OS + app; "fits" means estimate ≤ this fraction of total RAM. */
export const DEVICE_RAM_USABLE_FRACTION = 0.8

/** Weights load overhead + KV cache rough allowance. */
export const WEIGHT_OVERHEAD = 1.35
export const KV_HEADROOM_BYTES = 256 * 1024 * 1024

/** When Device.totalMemory is unavailable (simulator/web), assume 4 GiB. */
export const FALLBACK_DEVICE_RAM_BYTES = 4 * 1024 * 1024 * 1024

export function getDeviceRamBytes(): number {
  const n = Device.totalMemory
  if (typeof n === 'number' && n > 0) return n
  return FALLBACK_DEVICE_RAM_BYTES
}

export function estimateRuntimeRamBytes(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) return KV_HEADROOM_BYTES
  return Math.ceil(fileSizeBytes * WEIGHT_OVERHEAD + KV_HEADROOM_BYTES)
}

export type FitResult = {
  fits: boolean
  estimatedRamBytes: number
  deviceRamBytes: number
  usableRamBytes: number
}

export function evaluateModelFit(
  fileSizeBytes: number,
  deviceRamBytes: number = getDeviceRamBytes(),
): FitResult {
  const estimatedRamBytes = estimateRuntimeRamBytes(fileSizeBytes)
  const usableRamBytes = Math.floor(deviceRamBytes * DEVICE_RAM_USABLE_FRACTION)
  return {
    fits: estimatedRamBytes <= usableRamBytes,
    estimatedRamBytes,
    deviceRamBytes,
    usableRamBytes,
  }
}

export function formatGiB(bytes: number, digits = 1): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(digits)
}
