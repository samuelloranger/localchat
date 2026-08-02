export type RecencyBucket = 'today' | 'yesterday' | 'week' | 'month' | 'older'

const DAY = 24 * 60 * 60 * 1000

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Which section of the history a conversation belongs to.
 *
 * Buckets are calendar-relative, not elapsed-time: something from 23:50 last
 * night is "yesterday" at 00:10, which is how people actually remember it.
 */
export function recencyBucket(updatedAt: number, now: number): RecencyBucket {
  const today = startOfDay(now)
  if (updatedAt >= today) return 'today'
  if (updatedAt >= today - DAY) return 'yesterday'
  if (updatedAt >= today - 7 * DAY) return 'week'
  if (updatedAt >= today - 30 * DAY) return 'month'
  return 'older'
}

export const RECENCY_ORDER: RecencyBucket[] = ['today', 'yesterday', 'week', 'month', 'older']

/**
 * Compact age for a list row: minutes, then hours, then days, then a date.
 * Never longer than a few characters, because it sits beside the title.
 */
export function formatAge(updatedAt: number, now: number, locale: string): string {
  const diff = Math.max(0, now - updatedAt)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(updatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}
