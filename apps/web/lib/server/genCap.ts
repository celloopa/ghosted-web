/**
 * Per-day, per-session generation cap — applied ONLY when using the house
 * account (the owner is paying).  Visitors who connect their own key are
 * uncapped.
 *
 * Storage: .ghosted-local/usage/<YYYY-MM-DD>.json
 *   { [sessionId: string]: number }
 *
 * Env vars:
 *   GHOSTED_GEN_DAILY_CAP — integer, default 30
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// The data directory relative to the Next.js server process working directory.
// Must match the volume mount in the Dockerfile.
const DATA_DIR = join(process.cwd(), '.ghosted-local', 'usage')

/** Injectable store interface — lets tests pass an in-memory implementation. */
export interface CapStore {
  read(date: string): Promise<Record<string, number>>
  write(date: string, data: Record<string, number>): Promise<void>
}

/** File-backed store used in production. */
export const fileStore: CapStore = {
  async read(date) {
    try {
      const raw = await readFile(join(DATA_DIR, `${date}.json`), 'utf8')
      return JSON.parse(raw) as Record<string, number>
    } catch {
      return {}
    }
  },
  async write(date, data) {
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(join(DATA_DIR, `${date}.json`), JSON.stringify(data), 'utf8')
  },
}

/** YYYY-MM-DD for a given Date (or now). */
export function dateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export type CapResult = { ok: true; remaining: number } | { ok: false; limit: number }

/**
 * Check the session's counter for today.  If below the limit, increment and
 * return { ok: true, remaining }.  If at or above, return { ok: false }.
 *
 * @param sessionId  opaque string from the 'ghosted_sid' cookie
 * @param limit      maximum requests per day (default: GHOSTED_GEN_DAILY_CAP or 30)
 * @param store      injectable for testing; defaults to the file-backed store
 * @param today      injectable date for testing
 */
export async function checkAndIncrement(
  sessionId: string,
  limit: number = Number(process.env.GHOSTED_GEN_DAILY_CAP ?? 30),
  store: CapStore = fileStore,
  today: Date = new Date(),
): Promise<CapResult> {
  const date = dateKey(today)
  const data = await store.read(date)
  const current = data[sessionId] ?? 0

  if (current >= limit) {
    return { ok: false, limit }
  }

  data[sessionId] = current + 1
  await store.write(date, data)
  return { ok: true, remaining: limit - (current + 1) }
}
