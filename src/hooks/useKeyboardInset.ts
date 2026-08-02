import { useEffect, useRef } from 'react'
import { Animated, Keyboard, Platform, type KeyboardEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * How much the covered element has to rise: the keyboard's height minus the
 * home-indicator inset the layout already reserves. Never negative.
 */
export function keyboardLift(keyboardHeight: number, bottomInset: number): number {
  return Math.max(0, keyboardHeight - bottomInset)
}

/**
 * Bottom padding that keeps the composer above the keyboard.
 *
 * Deliberately not KeyboardAvoidingView: its `keyboardVerticalOffset` measures
 * from the top of the screen, so it needs the header's exact height. That was
 * hardcoded to 88, and the chat header is taller than that since it stacks a
 * title over the model name — leaving the composer partly under the keyboard.
 * Padding the bottom instead makes the header height irrelevant.
 *
 * iOS only. Android resizes the window itself under adjustResize, and adding
 * padding on top of that would double-count.
 */
export function useKeyboardInset(): Animated.Value {
  const insets = useSafeAreaInsets()
  const inset = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (Platform.OS !== 'ios') return

    const animate = (to: number, duration: number) => {
      Animated.timing(inset, {
        toValue: to,
        // Match the keyboard's own curve so the composer travels with it
        // instead of chasing it.
        duration: duration > 0 ? duration : 250,
        useNativeDriver: false,
      }).start()
    }

    const onShow = (event: KeyboardEvent) => {
      animate(keyboardLift(event.endCoordinates.height, insets.bottom), event.duration)
    }
    const onHide = (event: KeyboardEvent) => animate(0, event.duration)

    // "will" events fire before the animation starts on iOS, so the composer
    // moves in step with the keyboard rather than after it.
    const showSub = Keyboard.addListener('keyboardWillChangeFrame', onShow)
    const hideSub = Keyboard.addListener('keyboardWillHide', onHide)
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [inset, insets.bottom])

  return inset
}
