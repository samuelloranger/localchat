import { nextRangeHeader } from '../src/services/downloadManager'

test('resume uses Range from partial byte length', () => {
  expect(nextRangeHeader(0)).toBeUndefined()
  expect(nextRangeHeader(4096)).toBe('bytes=4096-')
})
