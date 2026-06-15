import type { MaterialsSnapshot } from '@ghosted/core'

/**
 * One-line preview of a snapshot: prefer cover_letter, else summary, else '(empty draft)'.
 * Collapses all whitespace to single spaces, trims, truncates to `max` chars with a trailing '…'.
 */
export function snapshotPreview(snap: MaterialsSnapshot, max = 90): string {
  const raw = snap.cover_letter || snap.summary || ''
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return '(empty draft)'
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

/**
 * Human relative time from `fromISO` to `nowISO` (both ISO strings).
 * Returns: 'just now' (<60s), 'N minute(s) ago' (<60m), 'N hour(s) ago' (<24h),
 * 'N day(s) ago' (<7d), otherwise a short absolute date like 'Jun 8'.
 * Guards against negative/future timestamps → 'just now'.
 */
export function relativeTime(fromISO: string, nowISO: string): string {
  const diffMs = new Date(nowISO).getTime() - new Date(fromISO).getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`

  return new Date(fromISO).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
