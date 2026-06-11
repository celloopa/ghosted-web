import type { Application, ClosedReason, Status, TransitionResult } from './types'

const ORDER: Record<Exclude<Status, 'closed'>, number> = {
  saved: 0,
  applied: 1,
  interviewing: 2,
  offer: 3,
}

export interface TransitionOptions {
  /** ISO date the transition happened — callers own the clock. */
  date: string
  closedReason?: ClosedReason
}

/**
 * Enforces legal status moves: forward-only along
 * saved → applied → interviewing → offer (skips allowed),
 * any status may close (with a reason), closed is terminal.
 * Pure — returns a new Application, never mutates.
 */
export function transition(app: Application, next: Status, opts: TransitionOptions): TransitionResult {
  if (app.status === 'closed') {
    return illegal(`${app.company} is closed — closed is terminal`)
  }
  if (next === app.status) {
    return illegal(`already ${next}`)
  }

  if (next === 'closed') {
    if (!opts.closedReason) {
      return {
        ok: false,
        error: { code: 'missing_closed_reason', message: 'closing requires a reason: rejected, withdrawn, or accepted' },
      }
    }
    return { ok: true, value: { ...app, status: 'closed', closed_reason: opts.closedReason } }
  }

  if (ORDER[next] < ORDER[app.status as Exclude<Status, 'closed'>]) {
    return illegal(`cannot move backward from ${app.status} to ${next}`)
  }

  const value: Application = { ...app, status: next, events: [...app.events] }
  if (next === 'applied') {
    value.date_applied = value.date_applied ?? opts.date
    if (!value.events.some((e) => e.type === 'applied')) {
      value.events.push({ type: 'applied', date: opts.date })
    }
  }
  return { ok: true, value }
}

function illegal(message: string): TransitionResult {
  return { ok: false, error: { code: 'illegal_transition', message } }
}
