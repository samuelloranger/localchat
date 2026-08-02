import { formatAge, recencyBucket } from '../src/chat/recency'

const now = new Date('2026-08-02T14:00:00').getTime()
const DAY = 24 * 60 * 60 * 1000

test('buckets are calendar-relative, not elapsed hours', () => {
  expect(recencyBucket(new Date('2026-08-02T00:10:00').getTime(), now)).toBe('today')
  // 23:50 the night before is "yesterday" even though only hours have passed.
  expect(recencyBucket(new Date('2026-08-01T23:50:00').getTime(), now)).toBe('yesterday')
  expect(recencyBucket(now - 3 * DAY, now)).toBe('week')
  expect(recencyBucket(now - 20 * DAY, now)).toBe('month')
  expect(recencyBucket(now - 200 * DAY, now)).toBe('older')
})

test('formatAge stays short', () => {
  expect(formatAge(now, now, 'en')).toBe('now')
  expect(formatAge(now - 5 * 60_000, now, 'en')).toBe('5m')
  expect(formatAge(now - 3 * 3_600_000, now, 'en')).toBe('3h')
  expect(formatAge(now - 3 * DAY, now, 'en')).toBe('3d')
  expect(formatAge(now - 60 * DAY, now, 'en')).toMatch(/\w/)
})

test('formatAge never goes negative on clock skew', () => {
  expect(formatAge(now + 60_000, now, 'en')).toBe('now')
})
