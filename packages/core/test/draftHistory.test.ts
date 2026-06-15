import { describe, it, expect } from 'vitest'
import { snapshotMaterials, pushHistory } from '../src/index'
import type { Materials, MaterialsSnapshot } from '../src/index'

const FULL_MATERIALS: Materials = {
  summary: 'Designer who codes.',
  cover_letter: 'Dear Stripe, I built a design system at Acme Corp.',
  resume_rewrites: [{ source: 'Built UI', rewrite: 'Built product UI', why: 'Matches role' }],
  opportunity_angles: [{ title: 'Systems', evidence: 'Figma', use: 'Resume' }],
  standout_suggestions: [{ title: 'Teardown', action: 'Send a critique', effort: 'medium' }],
  generated_at: '2026-06-15T10:00:00.000Z',
  model: 'claude-sonnet-4-5',
  revisions: 2,
  finalized_at: '2026-06-15T11:00:00.000Z',
  revisions_at_send: 2,
  exported_at: '2026-06-15T12:00:00.000Z',
  rewrite_decisions: { 0: { status: 'accepted' } },
  qa: [{ question: 'Why this role?', answer: 'I love design systems.', added_at: '2026-06-15T09:00:00.000Z' }],
  history: [{ at: '2026-06-14T10:00:00.000Z', summary: 'Old summary' }],
}

const AT = '2026-06-15T13:00:00.000Z'

// ── snapshotMaterials ────────────────────────────────────────────────────────

describe('snapshotMaterials', () => {
  it('copies content fields and the at timestamp', () => {
    const snap = snapshotMaterials(FULL_MATERIALS, AT)
    expect(snap.summary).toBe(FULL_MATERIALS.summary)
    expect(snap.cover_letter).toBe(FULL_MATERIALS.cover_letter)
    expect(snap.resume_rewrites).toEqual(FULL_MATERIALS.resume_rewrites)
    expect(snap.opportunity_angles).toEqual(FULL_MATERIALS.opportunity_angles)
    expect(snap.standout_suggestions).toEqual(FULL_MATERIALS.standout_suggestions)
    expect(snap.at).toBe(AT)
  })

  it('excludes metadata fields (generated_at, model, revisions, finalized_at, exported_at, rewrite_decisions, qa)', () => {
    const snap = snapshotMaterials(FULL_MATERIALS, AT) as unknown as Record<string, unknown>
    expect(snap).not.toHaveProperty('generated_at')
    expect(snap).not.toHaveProperty('model')
    expect(snap).not.toHaveProperty('revisions')
    expect(snap).not.toHaveProperty('finalized_at')
    expect(snap).not.toHaveProperty('revisions_at_send')
    expect(snap).not.toHaveProperty('exported_at')
    expect(snap).not.toHaveProperty('rewrite_decisions')
    expect(snap).not.toHaveProperty('qa')
  })

  it('excludes history itself (no nested history in snapshot)', () => {
    const snap = snapshotMaterials(FULL_MATERIALS, AT) as unknown as Record<string, unknown>
    expect(snap).not.toHaveProperty('history')
  })

  it('tolerates materials with only partial content fields (undefined fields omitted)', () => {
    const sparse: Materials = { cover_letter: 'Only a letter.', generated_at: '2026-06-15T10:00:00.000Z' }
    const snap = snapshotMaterials(sparse, AT) as unknown as Record<string, unknown>
    expect(snap.cover_letter).toBe('Only a letter.')
    expect(snap).not.toHaveProperty('summary')
    expect(snap).not.toHaveProperty('resume_rewrites')
    expect(snap.at).toBe(AT)
  })

  it('tolerates completely empty materials', () => {
    const snap = snapshotMaterials({}, AT)
    expect(snap.at).toBe(AT)
    const keys = Object.keys(snap)
    expect(keys).toEqual(['at'])
  })
})

// ── pushHistory ──────────────────────────────────────────────────────────────

describe('pushHistory', () => {
  it('prepends current content as a new snapshot (newest first)', () => {
    const m: Materials = { summary: 'Version 2', cover_letter: 'Letter v2' }
    const next = pushHistory(m, AT)
    expect(next.history).toHaveLength(1)
    expect(next.history![0]!.summary).toBe('Version 2')
    expect(next.history![0]!.at).toBe(AT)
  })

  it('preserves all other materials fields', () => {
    const m: Materials = { summary: 'S', cover_letter: 'CL', generated_at: '2026-06-15T10:00:00.000Z', revisions: 3 }
    const next = pushHistory(m, AT)
    expect(next.summary).toBe('S')
    expect(next.generated_at).toBe('2026-06-15T10:00:00.000Z')
    expect(next.revisions).toBe(3)
  })

  it('prepends to existing history (newest first)', () => {
    const old: MaterialsSnapshot = { at: '2026-06-14T10:00:00.000Z', summary: 'Old summary' }
    const m: Materials = { summary: 'New summary', history: [old] }
    const next = pushHistory(m, AT)
    expect(next.history).toHaveLength(2)
    expect(next.history![0]!.summary).toBe('New summary')
    expect(next.history![0]!.at).toBe(AT)
    expect(next.history![1]).toEqual(old)
  })

  it('caps history at max (default 10)', () => {
    // existing has 10 snapshots ordered newest-first: Version 10 … Version 1
    const existing: MaterialsSnapshot[] = Array.from({ length: 10 }, (_, i) => ({
      at: `2026-06-${(10 - i).toString().padStart(2, '0')}T00:00:00.000Z`,
      summary: `Version ${10 - i}`,
    }))
    // existing[0] = Version 10 (newest), existing[9] = Version 1 (oldest)
    const m: Materials = { summary: 'Version 11', history: existing }
    const next = pushHistory(m, AT)
    expect(next.history).toHaveLength(10)
    expect(next.history![0]!.summary).toBe('Version 11')
    // oldest entry (Version 1, at existing[9]) should be evicted
    expect(next.history!.some((s) => s.summary === 'Version 1')).toBe(false)
    // Version 2 (existing[8]) becomes the last entry
    expect(next.history![9]!.summary).toBe('Version 2')
  })

  it('respects custom max cap', () => {
    const existing: MaterialsSnapshot[] = Array.from({ length: 5 }, (_, i) => ({
      at: `2026-06-0${i + 1}T00:00:00.000Z`,
      summary: `Version ${i + 1}`,
    }))
    const m: Materials = { summary: 'Version 6', history: existing }
    const next = pushHistory(m, AT, 3)
    expect(next.history).toHaveLength(3)
    expect(next.history![0]!.summary).toBe('Version 6')
  })

  it('works on materials with no content fields (empty snapshot still recorded)', () => {
    const m: Materials = { generated_at: '2026-06-15T10:00:00.000Z' }
    const next = pushHistory(m, AT)
    expect(next.history).toHaveLength(1)
    expect(next.history![0]!.at).toBe(AT)
    expect(next.history![0]!).not.toHaveProperty('summary')
  })

  it('snapshot inside history does NOT contain nested history', () => {
    const m: Materials = {
      summary: 'S',
      history: [{ at: '2026-06-14T10:00:00.000Z', summary: 'Old' }],
    }
    const next = pushHistory(m, AT)
    const snap = next.history![0]! as unknown as Record<string, unknown>
    expect(snap).not.toHaveProperty('history')
  })

  it('restoring a snapshot fields onto materials round-trips content correctly', () => {
    const m: Materials = {
      summary: 'Current summary',
      cover_letter: 'Current letter',
      resume_rewrites: [{ source: 'A', rewrite: 'A2', why: 'w' }],
    }
    const withHistory = pushHistory(m, AT)
    // Simulate restore: apply snapshot fields back onto a modified materials
    const modified: Materials = { ...withHistory, summary: 'Modified summary', cover_letter: 'Modified letter' }
    const snap = withHistory.history![0]!
    const restored: Materials = { ...modified, summary: snap.summary, cover_letter: snap.cover_letter, resume_rewrites: snap.resume_rewrites }
    expect(restored.summary).toBe('Current summary')
    expect(restored.cover_letter).toBe('Current letter')
    expect(restored.resume_rewrites).toEqual([{ source: 'A', rewrite: 'A2', why: 'w' }])
  })
})
