/**
 * Unit tests for checkAndIncrement (genCap).
 *
 * All tests use an in-memory CapStore so no file system access is required.
 */

import { describe, it, expect } from 'vitest'
import { checkAndIncrement, dateKey, type CapStore } from '../lib/server/genCap'

/** Build a fresh in-memory store for each test. */
function memStore(): CapStore {
  const data: Record<string, Record<string, number>> = {}
  return {
    async read(date) {
      return { ...(data[date] ?? {}) }
    },
    async write(date, d) {
      data[date] = { ...d }
    },
  }
}

describe('checkAndIncrement', () => {
  it('allows a request under the limit and increments the counter', async () => {
    const store = memStore()
    const today = new Date('2025-01-15T12:00:00Z')
    const result = await checkAndIncrement('session-a', 5, store, today)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.remaining).toBe(4) // 5 - 1 used
  })

  it('blocks when the counter reaches the limit', async () => {
    const store = memStore()
    const today = new Date('2025-01-15T12:00:00Z')
    // Exhaust the limit.
    for (let i = 0; i < 3; i++) {
      await checkAndIncrement('session-b', 3, store, today)
    }
    // Fourth call should be blocked.
    const result = await checkAndIncrement('session-b', 3, store, today)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.limit).toBe(3)
  })

  it('different sessions have independent counters', async () => {
    const store = memStore()
    const today = new Date('2025-01-15T12:00:00Z')
    // Use up session-c to its limit.
    for (let i = 0; i < 2; i++) {
      await checkAndIncrement('session-c', 2, store, today)
    }
    // session-d should still be allowed.
    const result = await checkAndIncrement('session-d', 2, store, today)
    expect(result.ok).toBe(true)
  })

  it('different days have independent counters (day rollover)', async () => {
    const store = memStore()
    const day1 = new Date('2025-01-15T23:59:00Z')
    const day2 = new Date('2025-01-16T00:01:00Z')
    // Exhaust on day 1.
    for (let i = 0; i < 2; i++) {
      await checkAndIncrement('session-e', 2, store, day1)
    }
    // Should be allowed again on day 2.
    const result = await checkAndIncrement('session-e', 2, store, day2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.remaining).toBe(1)
  })

  it('remaining count decrements correctly across multiple calls', async () => {
    const store = memStore()
    const today = new Date('2025-02-01T10:00:00Z')
    const r1 = await checkAndIncrement('session-f', 10, store, today)
    const r2 = await checkAndIncrement('session-f', 10, store, today)
    const r3 = await checkAndIncrement('session-f', 10, store, today)
    expect(r1.ok && r1.remaining).toBe(9)
    expect(r2.ok && r2.remaining).toBe(8)
    expect(r3.ok && r3.remaining).toBe(7)
  })
})

describe('dateKey', () => {
  it('formats dates as YYYY-MM-DD', () => {
    expect(dateKey(new Date('2025-06-15T08:30:00Z'))).toBe('2025-06-15')
  })
})
