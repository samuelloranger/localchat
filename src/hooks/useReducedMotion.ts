import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Tracks the OS "Reduce Motion" setting.
 *
 * react-native does not export a hook for this, and reanimated's version pulls
 * in its runtime for what is one boolean. Reads the current value on mount and
 * follows it live, so toggling the setting stops an animation already running.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let active = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      active = false
      sub.remove()
    }
  }, [])

  return reduced
}
