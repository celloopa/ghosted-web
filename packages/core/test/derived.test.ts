import { describe, it, expect } from 'vitest'
import { isGhosted, needsFollowUp, reminderDue } from '../src/index'
import { makeApp, ev } from './helpers'

// Applied on Jan 1. Threshold 14 days → ghost line is Jan 15/16 boundary.
const APPLIED = '2026-01-01'

describe('isGhosted', () => {
  it('is true at exactly threshold+1 days with no response', () => {
    expect(isGhosted(makeApp(), '2026-01-16')).toBe(true)
  })

  it('is false at exactly the threshold', () => {
    expect(isGhosted(makeApp(), '2026-01-15')).toBe(false)
  })

  it('is false with any response event', () => {
    const app = makeApp({ events: [ev('applied', APPLIED), ev('response', '2026-01-10')] })
    expect(isGhosted(app, '2026-03-01')).toBe(false)
  })

  it('treats an interview event as a response (an interview IS contact)', () => {
    const app = makeApp({ events: [ev('applied', APPLIED), ev('interview', '2026-01-12')] })
    expect(isGhosted(app, '2026-03-01')).toBe(false)
  })

  it('ignores corrected (logged-in-error) response events', () => {
    const app = makeApp({ events: [ev('applied', APPLIED), ev('response', '2026-01-10', { corrected: true })] })
    expect(isGhosted(app, '2026-01-16')).toBe(true)
  })

  it('only applies to status=applied', () => {
    for (const status of ['saved', 'interviewing', 'offer', 'closed'] as const) {
      expect(isGhosted(makeApp({ status }), '2026-06-01')).toBe(false)
    }
  })

  it('respects a custom threshold', () => {
    expect(isGhosted(makeApp(), '2026-01-09', 7)).toBe(true)
    expect(isGhosted(makeApp(), '2026-01-08', 7)).toBe(false)
  })

  it('is false when there is no applied date at all', () => {
    const app = makeApp({ date_applied: undefined, events: [] })
    expect(isGhosted(app, '2026-06-01')).toBe(false)
  })
})

describe('needsFollowUp', () => {
  it('is true 7 days after applying with no response and no follow-up', () => {
    expect(needsFollowUp(makeApp(), '2026-01-08')).toBe(true)
  })

  it('is false before 7 days', () => {
    expect(needsFollowUp(makeApp(), '2026-01-07')).toBe(false)
  })

  it('stops after a response', () => {
    const app = makeApp({ events: [ev('applied', APPLIED), ev('response', '2026-01-05')] })
    expect(needsFollowUp(app, '2026-01-20')).toBe(false)
  })

  it('respects the 7-day cadence: quiet right after a follow-up, due again 7 days later', () => {
    const app = makeApp({ events: [ev('applied', APPLIED), ev('follow_up', '2026-01-08')] })
    expect(needsFollowUp(app, '2026-01-10')).toBe(false)
    expect(needsFollowUp(app, '2026-01-15')).toBe(true)
  })

  it('only applies to status=applied', () => {
    for (const status of ['saved', 'interviewing', 'offer', 'closed'] as const) {
      expect(needsFollowUp(makeApp({ status }), '2026-06-01')).toBe(false)
    }
  })
})

describe('reminderDue ("remind me" capture intent)', () => {
  const saved = { status: 'saved' as const, date_applied: undefined, events: [] }

  it('fires on and after the remind date, not before', () => {
    const app = makeApp({ ...saved, remind_at: '2026-06-10' })
    expect(reminderDue(app, '2026-06-09')).toBe(false)
    expect(reminderDue(app, '2026-06-10')).toBe(true)
    expect(reminderDue(app, '2026-06-15')).toBe(true)
  })

  it('only applies to saved applications — applied ones use needsFollowUp', () => {
    expect(reminderDue(makeApp({ status: 'applied', remind_at: '2026-06-01' }), '2026-06-11')).toBe(false)
  })

  it('no remind date, no reminder', () => {
    expect(reminderDue(makeApp(saved), '2026-06-11')).toBe(false)
  })
})
