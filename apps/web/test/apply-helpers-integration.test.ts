/**
 * Tests for the new pure helpers added to applyHelpers.ts:
 *   buildExportPayload       — payload-builder with bulletOrder mapping
 *   isStaleExport            — stale-export hint logic
 *   finaleActions            — visibility of finale actions by status
 *   isContentNewerThanExport — staleness rule for the detail-page Documents section
 */
import { describe, it, expect } from 'vitest'
import { buildExportPayload, isStaleExport, finaleActions, isContentNewerThanExport } from '../lib/applyHelpers'
import type { Application } from '@ghosted/core'
import type { ResumePlan } from '@ghosted/core'

// ── helpers ────────────────────────────────────────────────────────────────────

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-abc123',
    company: 'Acme Corp',
    position: 'Design Engineer',
    role_type: 'design_engineer',
    status: 'saved',
    events: [],
    posting: {
      description: 'Design systems role',
      fit_score: 80,
      fit_notes: [],
      matched: ['React', 'TypeScript', 'Figma'],
      missing: ['Go'],
      analyzed_at: '2026-06-11',
    },
    materials: {
      cover_letter: 'Dear Acme, I am interested.',
      summary: 'Design engineer with 4 years.',
      generated_at: '2026-06-11T10:00:00Z',
    },
    ...overrides,
  }
}

function makePlan(overrides: Partial<ResumePlan> = {}): ResumePlan {
  return {
    roles: [
      {
        name: 'Asheville Dispensary',
        order: [
          { text: 'Built design system', score: 2, originalIndex: 2 },
          { text: 'Wrote React components', score: 1, originalIndex: 0 },
          { text: 'Managed deployments', score: 0, originalIndex: 1 },
        ],
        changed: true,
      },
      {
        name: 'The Green Phial',
        order: [
          { text: 'Redesigned WordPress site', score: 0, originalIndex: 0 },
        ],
        changed: false,
      },
    ],
    skills_order: ['React', 'TypeScript', 'Figma', 'CSS'],
    skills_changed: true,
    ...overrides,
  }
}

// ── buildExportPayload ─────────────────────────────────────────────────────────

describe('buildExportPayload', () => {
  it('returns the correct appId, cvJson, and matchedKeywords', () => {
    const app = makeApp()
    const plan = makePlan()
    const cvJson = '{"basics":{"name":"Marcelo"}}'

    const payload = buildExportPayload(app, cvJson, plan)

    expect(payload.appId).toBe('app-abc123')
    expect(payload.cvJson).toBe(cvJson)
    expect(payload.matchedKeywords).toEqual(['React', 'TypeScript', 'Figma'])
  })

  it('maps bulletOrder to originalIndex arrays', () => {
    const plan = makePlan()
    const payload = buildExportPayload(makeApp(), '{}', plan)

    // Asheville Dispensary: order is [2,0,1] (by originalIndex)
    expect(payload.bulletOrder).toHaveLength(2)
    const asheville = payload.bulletOrder.find((b) => b.name === 'Asheville Dispensary')!
    expect(asheville).toBeDefined()
    expect(asheville.order).toEqual([2, 0, 1])

    // The Green Phial: single bullet, originalIndex 0
    const phial = payload.bulletOrder.find((b) => b.name === 'The Green Phial')!
    expect(phial).toBeDefined()
    expect(phial.order).toEqual([0])
  })

  it('includes skillsOrder from plan', () => {
    const payload = buildExportPayload(makeApp(), '{}', makePlan())
    expect(payload.skillsOrder).toEqual(['React', 'TypeScript', 'Figma', 'CSS'])
  })

  it('includes summary and coverLetter from materials', () => {
    const payload = buildExportPayload(makeApp(), '{}', makePlan())
    expect(payload.summary).toBe('Design engineer with 4 years.')
    expect(payload.coverLetter).toBe('Dear Acme, I am interested.')
  })

  it('uses empty string for coverLetter when materials has none', () => {
    const app = makeApp({ materials: {} })
    const payload = buildExportPayload(app, '{}', makePlan())
    expect(payload.coverLetter).toBe('')
  })

  it('has undefined summary when materials has none', () => {
    const app = makeApp({ materials: { cover_letter: 'Hello.' } })
    const payload = buildExportPayload(app, '{}', makePlan())
    expect(payload.summary).toBeUndefined()
  })

  it('produces the exact /api/export payload shape', () => {
    const cvJson = '{"basics":{"name":"X","email":"x@x.com"}}'
    const app = makeApp()
    const plan = makePlan()
    const payload = buildExportPayload(app, cvJson, plan)

    // All required keys present
    expect(Object.keys(payload).sort()).toEqual([
      'appId', 'bulletOrder', 'coverLetter', 'cvJson', 'matchedKeywords', 'skillsOrder', 'summary',
    ].sort())
  })
})

// ── isStaleExport ─────────────────────────────────────────────────────────────

describe('isStaleExport', () => {
  it('returns false when exportedAt is undefined (never exported)', () => {
    expect(isStaleExport(undefined, '2026-06-11T12:00:00Z')).toBe(false)
  })

  it('returns false when generatedAt is undefined', () => {
    expect(isStaleExport('2026-06-11T10:00:00Z', undefined)).toBe(false)
  })

  it('returns false when both are undefined', () => {
    expect(isStaleExport(undefined, undefined)).toBe(false)
  })

  it('returns true when generatedAt is after exportedAt', () => {
    expect(isStaleExport('2026-06-11T10:00:00Z', '2026-06-11T11:00:00Z')).toBe(true)
  })

  it('returns false when generatedAt equals exportedAt', () => {
    expect(isStaleExport('2026-06-11T10:00:00Z', '2026-06-11T10:00:00Z')).toBe(false)
  })

  it('returns false when generatedAt is before exportedAt (re-exported after revise)', () => {
    expect(isStaleExport('2026-06-11T12:00:00Z', '2026-06-11T10:00:00Z')).toBe(false)
  })
})

// ── isContentNewerThanExport ──────────────────────────────────────────────────

describe('isContentNewerThanExport', () => {
  it('returns false when materials is undefined', () => {
    expect(isContentNewerThanExport(undefined)).toBe(false)
  })

  it('returns false when materials is null', () => {
    expect(isContentNewerThanExport(null)).toBe(false)
  })

  it('returns false when generated_at is absent (nothing generated yet)', () => {
    expect(isContentNewerThanExport({ cover_letter: 'Hello.' })).toBe(false)
  })

  it('returns false when exported_at is absent and generated_at is set (never exported)', () => {
    // exported_at missing → we cannot say content is stale relative to an export that never happened
    expect(isContentNewerThanExport({ generated_at: '2026-06-11T10:00:00Z' })).toBe(false)
  })

  it('returns true when generated_at is after exported_at', () => {
    expect(isContentNewerThanExport({
      generated_at: '2026-06-11T12:00:00Z',
      exported_at: '2026-06-11T10:00:00Z',
    })).toBe(true)
  })

  it('returns false when generated_at equals exported_at', () => {
    expect(isContentNewerThanExport({
      generated_at: '2026-06-11T10:00:00Z',
      exported_at: '2026-06-11T10:00:00Z',
    })).toBe(false)
  })

  it('returns false when exported_at is after generated_at (export is current)', () => {
    expect(isContentNewerThanExport({
      generated_at: '2026-06-11T10:00:00Z',
      exported_at: '2026-06-11T12:00:00Z',
    })).toBe(false)
  })

  it('ignores unrelated materials fields — only generated_at and exported_at matter', () => {
    expect(isContentNewerThanExport({
      cover_letter: 'Hello.',
      summary: 'A summary.',
      revisions: 5,
      generated_at: '2026-06-11T11:00:00Z',
      exported_at: '2026-06-11T09:00:00Z',
    })).toBe(true)
  })
})

// ── finaleActions ──────────────────────────────────────────────────────────────

describe('finaleActions', () => {
  it('shows markApplied and hides backToDetails for "saved"', () => {
    const actions = finaleActions('saved')
    expect(actions.showMarkApplied).toBe(true)
    expect(actions.showBackToDetails).toBe(false)
  })

  it('hides markApplied and shows backToDetails for "applied"', () => {
    const actions = finaleActions('applied')
    expect(actions.showMarkApplied).toBe(false)
    expect(actions.showBackToDetails).toBe(true)
  })

  it('hides markApplied and shows backToDetails for "interviewing"', () => {
    const actions = finaleActions('interviewing')
    expect(actions.showMarkApplied).toBe(false)
    expect(actions.showBackToDetails).toBe(true)
  })

  it('hides markApplied and shows backToDetails for "offer"', () => {
    const actions = finaleActions('offer')
    expect(actions.showMarkApplied).toBe(false)
    expect(actions.showBackToDetails).toBe(true)
  })

  it('hides markApplied and shows backToDetails for "closed"', () => {
    const actions = finaleActions('closed')
    expect(actions.showMarkApplied).toBe(false)
    expect(actions.showBackToDetails).toBe(true)
  })
})
