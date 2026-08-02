import { keyboardLift } from '../src/hooks/useKeyboardInset'

test('lift is the keyboard height less the inset the layout already reserves', () => {
  expect(keyboardLift(336, 34)).toBe(302)
  expect(keyboardLift(291, 0)).toBe(291)
})

test('lift never goes negative', () => {
  // A floating or split keyboard can report less height than the safe area.
  expect(keyboardLift(20, 34)).toBe(0)
  expect(keyboardLift(0, 34)).toBe(0)
})
