/** Whole days between two ISO dates/datetimes (UTC, floor). */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(fromISO)
  const to = Date.parse(toISO)
  return Math.floor((to - from) / 86_400_000)
}
