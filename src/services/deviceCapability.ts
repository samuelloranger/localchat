import * as Device from 'expo-device'
import { Platform } from 'react-native'

import { N_CTX } from '@/src/services/inferenceConstants'

/**
 * Usable RAM fraction of physical memory for model budgeting.
 * iOS: jetsam kills apps well below physical RAM (~35–45% is a practical ceiling).
 * Android: foreground apps can use more, but the OS reclaims aggressively (~60–70%).
 */
export const IOS_RAM_USABLE_FRACTION = 0.4
export const ANDROID_RAM_USABLE_FRACTION = 0.65

/** @deprecated Use platform-specific constants via getDeviceRamUsableFraction(). */
export const DEVICE_RAM_USABLE_FRACTION = IOS_RAM_USABLE_FRACTION

/**
 * Weight load overhead with mmap (use_mmap: true). Resident pages are demand-paged;
 * 1.15 is a softer allowance than a full in-RAM load.
 */
export const WEIGHT_OVERHEAD = 1.15

/** KV cache bytes per context token — tied to N_CTX so estimator and loader stay aligned. */
export const KV_BYTES_PER_CTX_TOKEN = (256 * 1024 * 1024) / 2048

/** When Device.totalMemory is unavailable, assume 2 GiB (conservative low-end device). */
export const FALLBACK_DEVICE_RAM_BYTES = 2 * 1024 * 1024 * 1024

export function getDeviceRamUsableFraction(): number {
  return Platform.OS === 'ios' ? IOS_RAM_USABLE_FRACTION : ANDROID_RAM_USABLE_FRACTION
}

export function getDeviceRamBytes(): number {
  const n = Device.totalMemory
  if (typeof n === 'number' && n > 0) return n
  return FALLBACK_DEVICE_RAM_BYTES
}

export function estimateKvHeadroomBytes(nCtx: number = N_CTX): number {
  return Math.ceil(nCtx * KV_BYTES_PER_CTX_TOKEN)
}

export function estimateRuntimeRamBytes(
  fileSizeBytes: number,
  nCtx: number = N_CTX,
): number {
  const kv = estimateKvHeadroomBytes(nCtx)
  if (fileSizeBytes <= 0) return kv
  return Math.ceil(fileSizeBytes * WEIGHT_OVERHEAD + kv)
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
  nCtx: number = N_CTX,
): FitResult {
  const estimatedRamBytes = estimateRuntimeRamBytes(fileSizeBytes, nCtx)
  const usableRamBytes = Math.floor(deviceRamBytes * getDeviceRamUsableFraction())
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
