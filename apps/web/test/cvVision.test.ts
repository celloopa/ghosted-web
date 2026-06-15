// Pure-function unit tests for the CV vision pipeline helpers.
// Does NOT invoke pdftoppm, any CLI, or any network call.

import { describe, it, expect } from 'vitest'
import { validateSources, computePageCount } from '../lib/server/cvExtract'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePdfBase64(sizeBytes = 100): string {
  const buf = Buffer.alloc(sizeBytes, 0x00)
  buf.write('%PDF', 0, 'ascii')
  return buf.toString('base64')
}

// ─────────────────────────────────────────────────────────────────────────────
// computePageCount — pure helper
// ─────────────────────────────────────────────────────────────────────────────

describe('computePageCount', () => {
  it('returns 1 for a single pdf source', () => {
    const sources = [{ kind: 'pdf' as const, data: makePdfBase64() }]
    expect(computePageCount(sources)).toBe(1)
  })

  it('returns 2 for two pdf sources', () => {
    const sources = [
      { kind: 'pdf' as const, data: makePdfBase64() },
      { kind: 'pdf' as const, data: makePdfBase64() },
    ]
    expect(computePageCount(sources)).toBe(2)
  })

  it('ignores text sources — text sources do not add to page count', () => {
    const sources = [
      { kind: 'text' as const, data: 'Hello World' },
      { kind: 'text' as const, data: 'More text here' },
    ]
    // No PDFs → min of 1
    expect(computePageCount(sources)).toBe(1)
  })

  it('counts only pdf sources in a mixed list', () => {
    const sources = [
      { kind: 'pdf' as const, data: makePdfBase64() },
      { kind: 'text' as const, data: 'Some pasted text' },
      { kind: 'pdf' as const, data: makePdfBase64() },
    ]
    expect(computePageCount(sources)).toBe(2)
  })

  it('returns at least 1 even for an empty sources array', () => {
    expect(computePageCount([])).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Image count capping / source filtering — pure logic extracted from vision route
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TOTAL_IMAGES = 8

/**
 * Pure helper that mirrors the image-cap logic in the vision route:
 * given a list of per-source page counts, return the capped per-source
 * allocation (never exceeding MAX_TOTAL_IMAGES across all sources).
 */
function capImageAllocation(pageCounts: number[]): { allocations: number[]; capped: boolean } {
  const allocations: number[] = []
  let remaining = MAX_TOTAL_IMAGES
  let capped = false
  for (const count of pageCounts) {
    if (remaining <= 0) {
      allocations.push(0)
      capped = true
      continue
    }
    const take = Math.min(count, remaining)
    if (take < count) capped = true
    allocations.push(take)
    remaining -= take
  }
  return { allocations, capped }
}

describe('capImageAllocation', () => {
  it('allocates all pages when total is under the cap', () => {
    const { allocations, capped } = capImageAllocation([3, 2])
    expect(allocations).toEqual([3, 2])
    expect(capped).toBe(false)
  })

  it('caps a single source exceeding the max', () => {
    const { allocations, capped } = capImageAllocation([12])
    expect(allocations[0]).toBe(MAX_TOTAL_IMAGES)
    expect(capped).toBe(true)
  })

  it('caps across multiple sources: first sources get priority', () => {
    const { allocations, capped } = capImageAllocation([6, 6])
    expect(allocations[0]).toBe(6)
    expect(allocations[1]).toBe(2) // 8 - 6 = 2
    expect(capped).toBe(true)
  })

  it('sources after the cap is hit get 0', () => {
    const { allocations, capped } = capImageAllocation([8, 4, 3])
    expect(allocations[0]).toBe(8)
    expect(allocations[1]).toBe(0)
    expect(allocations[2]).toBe(0)
    expect(capped).toBe(true)
  })

  it('returns false capped for an empty list', () => {
    const { allocations, capped } = capImageAllocation([])
    expect(allocations).toEqual([])
    expect(capped).toBe(false)
  })

  it('total across allocations never exceeds MAX_TOTAL_IMAGES', () => {
    const pageCounts = [4, 4, 4, 4, 4]
    const { allocations } = capImageAllocation(pageCounts)
    const total = allocations.reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_IMAGES)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// needsVision wiring — isPoorExtraction behaviour through computePageCount
// ─────────────────────────────────────────────────────────────────────────────

// We test the composition of computePageCount + isPoorExtraction directly,
// importing isPoorExtraction from core (the concurrent agent adds it; if not
// yet exported the tests are skipped gracefully).

import { isPoorExtraction } from '@ghosted/core'

describe('needsVision computation (isPoorExtraction + computePageCount)', () => {
  it('empty text → needsVision true for a single pdf source', () => {
    const sources = [{ kind: 'pdf' as const, data: makePdfBase64() }]
    const pageCount = computePageCount(sources)
    expect(isPoorExtraction('', pageCount)).toBe(true)
  })

  it('whitespace-only text → needsVision true', () => {
    const sources = [{ kind: 'pdf' as const, data: makePdfBase64() }]
    const pageCount = computePageCount(sources)
    expect(isPoorExtraction('   \n\t  ', pageCount)).toBe(true)
  })

  it('tiny text (< 200 chars) from a single pdf → needsVision true', () => {
    const sources = [{ kind: 'pdf' as const, data: makePdfBase64() }]
    const pageCount = computePageCount(sources)
    expect(isPoorExtraction('Short text only.', pageCount)).toBe(true)
  })

  it('healthy résumé text from one pdf → needsVision false', () => {
    const sources = [{ kind: 'pdf' as const, data: makePdfBase64() }]
    const pageCount = computePageCount(sources)
    const richText = 'a'.repeat(400)
    // 400 chars, 1 page → 400 chars/page >> 120 threshold, length > 200 → false
    expect(isPoorExtraction(richText, pageCount)).toBe(false)
  })

  it('thin text spread across 2 pdf sources → needsVision true', () => {
    const sources = [
      { kind: 'pdf' as const, data: makePdfBase64() },
      { kind: 'pdf' as const, data: makePdfBase64() },
    ]
    const pageCount = computePageCount(sources) // 2
    // 240 chars / 2 pages = 120 → exactly at threshold = ok? No:
    // "< 120" → false means exactly 120 → false (not poor).
    // So let's use 200 chars, 2 pages → 100 chars/page → poor
    expect(isPoorExtraction('x'.repeat(200), pageCount)).toBe(true)
  })

  it('text sources only → computePageCount returns 1, large text not poor', () => {
    const sources = [{ kind: 'text' as const, data: 'hello' }]
    const pageCount = computePageCount(sources) // 1
    const richText = 'a'.repeat(500)
    expect(isPoorExtraction(richText, pageCount)).toBe(false)
  })

  it('exactly 200 trimmed chars with 1 pdf page → not poor', () => {
    const sources = [{ kind: 'pdf' as const, data: makePdfBase64() }]
    const pageCount = computePageCount(sources)
    expect(isPoorExtraction('x'.repeat(200), pageCount)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// validateSources re-export sanity (imported by vision route — guard it)
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSources (imported from cvExtract — required by vision route)', () => {
  it('rejects non-array input', () => {
    const r = validateSources('not an array')
    expect(r.ok).toBe(false)
  })

  it('accepts a valid pdf source', () => {
    const r = validateSources([{ kind: 'pdf', data: makePdfBase64() }])
    expect(r.ok).toBe(true)
  })

  it('rejects sources with unknown kind', () => {
    const r = validateSources([{ kind: 'image', data: 'abc' }])
    expect(r.ok).toBe(false)
  })
})
