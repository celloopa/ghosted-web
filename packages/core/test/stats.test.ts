import { describe, it, expect } from 'vitest'
import { computeStats, deriveSource } from '../src/index'
import { makeApp, ev } from './helpers'

// Fixture funnel: 6 design_engineer apps (4 responded, 3 interviewed),
// 2 product_designer apps (0 responses), 1 saved (never applied — excluded).
function fixtureApps() {
  const de = (n: number, events: ReturnType<typeof ev>[], extra = {}) =>
    makeApp({
      role_type: 'design_engineer',
      source: 'greenhouse',
      resume_version: 'v2-design-eng',
      date_applied: '2026-01-01',
      events: [ev('applied', '2026-01-01'), ...events],
      ...extra,
    })
  return [
    de(1, [ev('response', '2026-01-05')]),                                  // responded day 4
    de(2, [ev('response', '2026-01-09'), ev('interview', '2026-01-15')]),   // responded day 8, interviewed
    de(3, [ev('interview', '2026-01-03')], { status: 'interviewing' }),     // interview = response, day 2
    de(4, [ev('response', '2026-01-07'), ev('interview', '2026-01-20')]),   // responded day 6, interviewed
    de(5, []),                                                              // ghosted
    de(6, []),                                                              // ghosted
    makeApp({
      role_type: 'product_designer',
      resume_version: 'v1-generalist',
      date_applied: '2026-01-01',
      events: [ev('applied', '2026-01-01')],
      // no source on purpose → unclassified
    }),
    makeApp({
      role_type: 'product_designer',
      source: 'linkedin',
      resume_version: 'v1-generalist',
      date_applied: '2026-01-01',
      events: [ev('applied', '2026-01-01')],
    }),
    makeApp({ role_type: 'brand_motion', status: 'saved', date_applied: undefined, events: [] }), // never applied
  ]
}

function group(stats: { key: string }[], key: string) {
  const g = stats.find((s) => s.key === key)
  if (!g) throw new Error(`missing group ${key}`)
  return g as any
}

describe('computeStats returns correct rates and groupings for fixture sets', () => {
  const stats = computeStats(fixtureApps())

  it('computes response and interview rate by role_type', () => {
    const de = group(stats.byRoleType, 'design_engineer')
    expect(de.total).toBe(6)
    expect(de.responses).toBe(4)
    expect(de.responseRate).toBeCloseTo(4 / 6)
    expect(de.interviews).toBe(3)
    expect(de.interviewRate).toBeCloseTo(3 / 6)
  })

  it('groups by source and resume_version with the same math', () => {
    expect(group(stats.bySource, 'greenhouse').responses).toBe(4)
    expect(group(stats.byResumeVersion, 'v2-design-eng').total).toBe(6)
    expect(group(stats.byResumeVersion, 'v1-generalist').responseRate).toBe(0)
  })

  it('handles unclassified groups (missing source)', () => {
    expect(group(stats.bySource, 'unclassified').total).toBe(1)
  })

  it('excludes never-applied (saved) applications from rates', () => {
    const bm = stats.byRoleType.find((g) => g.key === 'brand_motion')
    expect(bm?.total ?? 0).toBe(0)
  })

  it('flags low-data groups (under 5 applied)', () => {
    expect(group(stats.byRoleType, 'design_engineer').lowData).toBe(false)
    expect(group(stats.byRoleType, 'product_designer').lowData).toBe(true)
  })

  it('computes median days to first response', () => {
    // response gaps: 4, 8, 2, 6 days → median (4+6)/2 = 5
    expect(group(stats.byRoleType, 'design_engineer').medianDaysToFirstResponse).toBe(5)
    expect(group(stats.byRoleType, 'product_designer').medianDaysToFirstResponse).toBeNull()
  })

  it('handles an empty application list', () => {
    const empty = computeStats([])
    expect(empty.byRoleType).toEqual([])
    expect(empty.bySource).toEqual([])
  })

  it('ignores corrected events in rate math', () => {
    const apps = [
      makeApp({
        date_applied: '2026-01-01',
        events: [ev('applied', '2026-01-01'), ev('response', '2026-01-05', { corrected: true })],
      }),
    ]
    expect(group(computeStats(apps).byRoleType, 'design_engineer').responses).toBe(0)
  })
})

describe('deriveSource', () => {
  it('maps known ATS hosts to friendly names', () => {
    expect(deriveSource('https://boards.greenhouse.io/acme/jobs/123')).toBe('greenhouse')
    expect(deriveSource('https://jobs.lever.co/acme/abc')).toBe('lever')
    expect(deriveSource('https://www.linkedin.com/jobs/view/123')).toBe('linkedin')
    expect(deriveSource('https://jobs.ashbyhq.com/acme/role')).toBe('ashby')
  })

  it('falls back to the bare hostname', () => {
    expect(deriveSource('https://careers.figma.com/job/123')).toBe('careers.figma.com')
  })

  it('returns undefined for garbage', () => {
    expect(deriveSource('not a url')).toBeUndefined()
  })
})
