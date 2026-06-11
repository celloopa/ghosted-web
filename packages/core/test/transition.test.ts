import { describe, it, expect } from 'vitest'
import { transition } from '../src/index'
import { makeApp } from './helpers'

describe('transition(app, newStatus) enforces legal moves', () => {
  it('allows the forward path saved → applied → interviewing → offer', () => {
    let app = makeApp({ status: 'saved', date_applied: undefined, events: [] })
    for (const next of ['applied', 'interviewing', 'offer'] as const) {
      const r = transition(app, next, { date: '2026-02-01' })
      expect(r.ok).toBe(true)
      if (r.ok) app = r.value
    }
    expect(app.status).toBe('offer')
  })

  it('allows skipping forward (applied → offer)', () => {
    const r = transition(makeApp({ status: 'applied' }), 'offer', { date: '2026-02-01' })
    expect(r.ok).toBe(true)
  })

  it('rejects backward moves (interviewing → applied)', () => {
    const r = transition(makeApp({ status: 'interviewing' }), 'applied', { date: '2026-02-01' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('illegal_transition')
  })

  it('rejects transitioning to the current status', () => {
    const r = transition(makeApp({ status: 'applied' }), 'applied', { date: '2026-02-01' })
    expect(r.ok).toBe(false)
  })

  it('closed requires closed_reason', () => {
    const noReason = transition(makeApp(), 'closed', { date: '2026-02-01' })
    expect(noReason.ok).toBe(false)
    if (!noReason.ok) expect(noReason.error.code).toBe('missing_closed_reason')

    const withReason = transition(makeApp(), 'closed', { date: '2026-02-01', closedReason: 'rejected' })
    expect(withReason.ok).toBe(true)
    if (withReason.ok) expect(withReason.value.closed_reason).toBe('rejected')
  })

  it('any status may close (saved → closed counts as withdrawn interest)', () => {
    const r = transition(makeApp({ status: 'saved', events: [] }), 'closed', {
      date: '2026-02-01',
      closedReason: 'withdrawn',
    })
    expect(r.ok).toBe(true)
  })

  it('closed is terminal', () => {
    const closed = makeApp({ status: 'closed', closed_reason: 'rejected' })
    const r = transition(closed, 'applied', { date: '2026-02-01' })
    expect(r.ok).toBe(false)
  })

  it('saved → applied stamps date_applied and appends an applied event', () => {
    const r = transition(makeApp({ status: 'saved', date_applied: undefined, events: [] }), 'applied', {
      date: '2026-02-03',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.date_applied).toBe('2026-02-03')
      expect(r.value.events).toContainEqual({ type: 'applied', date: '2026-02-03' })
    }
  })

  it('does not mutate the input application', () => {
    const app = makeApp({ status: 'saved', events: [] })
    transition(app, 'applied', { date: '2026-02-01' })
    expect(app.status).toBe('saved')
    expect(app.events).toHaveLength(0)
  })
})
