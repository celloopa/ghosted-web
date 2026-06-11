export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function relDays(fromISO: string, todayStr = todayISO()): string {
  const days = Math.floor((Date.parse(todayStr) - Date.parse(fromISO)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d'
  return `${days}d`
}
