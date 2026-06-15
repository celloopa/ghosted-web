import { describe, it, expect } from 'vitest'
import type { MaterialsSnapshot } from '@ghosted/core'
import { snapshotPreview, relativeTime } from '../lib/draftHistoryView'

// ---- snapshotPreview ----

describe('snapshotPreview — source preference', () => {
  it('prefers cover_letter over summary', () => {
    const snap: MaterialsSnapshot = { cover_letter: 'Dear hiring team', summary: 'Some summary', at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toContain('Dear hiring team')
    expect(snapshotPreview(snap)).not.toContain('Some summary')
  })

  it('falls back to summary when no cover_letter', () => {
    const snap: MaterialsSnapshot = { summary: 'A summary value', at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toContain('A summary value')
  })

  it('returns "(empty draft)" when neither cover_letter nor summary', () => {
    const snap: MaterialsSnapshot = { at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toBe('(empty draft)')
  })

  it('returns "(empty draft)" when both cover_letter and summary are empty strings', () => {
    const snap: MaterialsSnapshot = { cover_letter: '', summary: '', at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toBe('(empty draft)')
  })
})

describe('snapshotPreview — whitespace collapsing', () => {
  it('collapses multiple spaces to single space', () => {
    const snap: MaterialsSnapshot = { cover_letter: 'Hello   world', at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toBe('Hello world')
  })

  it('collapses newlines to single space', () => {
    const snap: MaterialsSnapshot = { cover_letter: 'Hello\nworld\nfoo', at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toBe('Hello world foo')
  })

  it('collapses tabs and mixed whitespace', () => {
    const snap: MaterialsSnapshot = { cover_letter: 'Hello\t\n  world', at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toBe('Hello world')
  })

  it('trims leading and trailing whitespace', () => {
    const snap: MaterialsSnapshot = { cover_letter: '  Hello world  ', at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toBe('Hello world')
  })
})

describe('snapshotPreview — truncation', () => {
  const LONG = 'abcdefghij'.repeat(20) // 200 chars

  it('truncates to default 90 chars with trailing "…"', () => {
    const snap: MaterialsSnapshot = { cover_letter: LONG, at: '2026-01-01T00:00:00Z' }
    const result = snapshotPreview(snap)
    expect(result.endsWith('…')).toBe(true)
    // content before ellipsis = 90 chars, total = 91
    expect(result.length).toBe(91)
  })

  it('does not truncate when text is exactly max', () => {
    const exact = 'a'.repeat(90)
    const snap: MaterialsSnapshot = { cover_letter: exact, at: '2026-01-01T00:00:00Z' }
    const result = snapshotPreview(snap)
    expect(result).toBe(exact)
    expect(result.endsWith('…')).toBe(false)
  })

  it('respects a custom max', () => {
    const snap: MaterialsSnapshot = { cover_letter: LONG, at: '2026-01-01T00:00:00Z' }
    const result = snapshotPreview(snap, 20)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBe(21)
  })

  it('returns short text unchanged when shorter than max', () => {
    const snap: MaterialsSnapshot = { cover_letter: 'Hi', at: '2026-01-01T00:00:00Z' }
    expect(snapshotPreview(snap)).toBe('Hi')
  })
})

// ---- relativeTime ----

describe('relativeTime — just now', () => {
  it('returns "just now" for 0 seconds difference', () => {
    const now = '2026-06-15T12:00:00Z'
    expect(relativeTime(now, now)).toBe('just now')
  })

  it('returns "just now" for 59 seconds difference', () => {
    const from = '2026-06-15T11:59:01Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('just now')
  })

  it('returns "just now" for future timestamps (negative delta)', () => {
    const from = '2026-06-15T12:00:10Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('just now')
  })
})

describe('relativeTime — minutes', () => {
  it('returns "1 minute ago" for exactly 60 seconds', () => {
    const from = '2026-06-15T11:59:00Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('1 minute ago')
  })

  it('returns "2 minutes ago" for 120 seconds', () => {
    const from = '2026-06-15T11:58:00Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('2 minutes ago')
  })

  it('returns "59 minutes ago" for 3540 seconds', () => {
    const from = '2026-06-15T11:01:00Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('59 minutes ago')
  })
})

describe('relativeTime — hours', () => {
  it('returns "1 hour ago" for exactly 60 minutes', () => {
    const from = '2026-06-15T11:00:00Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('1 hour ago')
  })

  it('returns "2 hours ago" for 120 minutes', () => {
    const from = '2026-06-15T10:00:00Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('2 hours ago')
  })

  it('returns "23 hours ago" for 23 hours', () => {
    const from = '2026-06-14T13:00:00Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('23 hours ago')
  })
})

describe('relativeTime — days', () => {
  it('returns "1 day ago" for exactly 24 hours', () => {
    const from = '2026-06-14T12:00:00Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('1 day ago')
  })

  it('returns "6 days ago" for 6 days', () => {
    const from = '2026-06-09T12:00:00Z'
    const now  = '2026-06-15T12:00:00Z'
    expect(relativeTime(from, now)).toBe('6 days ago')
  })
})

describe('relativeTime — absolute date fallback', () => {
  it('returns a short date string for more than 7 days', () => {
    const from = '2026-06-07T12:00:00Z' // 8 days before
    const now  = '2026-06-15T12:00:00Z'
    const result = relativeTime(from, now)
    // Should be something like "Jun 7" — not a relative phrase
    expect(result).toMatch(/^[A-Z][a-z]+ \d+$/)
    expect(result).not.toContain('ago')
  })

  it('returns "Jun 8" for 7 days exactly (boundary: >7 days → absolute)', () => {
    // exactly 7 days = 604800 seconds — boundary is <7d → days, else absolute
    const from = '2026-06-08T12:00:00Z' // exactly 7 days before
    const now  = '2026-06-15T12:00:00Z'
    // 7 days exactly hits the >=7d threshold for absolute
    const result = relativeTime(from, now)
    // Could be "Jun 8" (absolute) or "7 days ago" depending on boundary definition.
    // The spec says <7d → days, otherwise absolute.  Exactly 7d is NOT <7d → absolute.
    expect(result).toMatch(/^[A-Z][a-z]+ \d+$/)
  })
})
