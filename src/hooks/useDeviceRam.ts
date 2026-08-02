import { useMemo } from 'react'

import { getDeviceRamBytes } from '@/src/services/deviceCapability'

export function useDeviceRam(): number {
  return useMemo(() => getDeviceRamBytes(), [])
}
