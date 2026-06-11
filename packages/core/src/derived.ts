import type { Application, ApplicationEvent } from './types'
import { daysBetween } from './dates'

export const GHOST_THRESHOLD_DAYS = 14
export const FOLLOW_UP_CADENCE_DAYS = 7

/** Uncorrected events of the given types, oldest first. */
function liveEvents(app: Application, ...types: ApplicationEvent['type'][]): ApplicationEvent[] {
  return app.events
    .filter((e) => !e.corrected && types.includes(e.type))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** The date this application was applied, from the fact or the event log. */
export function appliedDate(app: Application): string | undefined {
  return app.date_applied ?? liveEvents(app, 'applied')[0]?.date
}

/** An interview is contact too — both clear ghost/follow-up state. */
function hasResponse(app: Application): boolean {
  return liveEvents(app, 'response', 'interview').length > 0
}

/**
 * Ghosted is COMPUTED, never stored: status=applied, no response event,
 * and more than `thresholdDays` days of silence since applying.
 */
export function isGhosted(app: Application, today: string, thresholdDays = GHOST_THRESHOLD_DAYS): boolean {
  if (app.status !== 'applied') return false
  const applied = appliedDate(app)
  if (!applied) return false
  if (hasResponse(app)) return false
  return daysBetween(applied, today) > thresholdDays
}

/**
 * Needs a follow-up: applied >= 7 days ago, still no response, and no
 * follow-up logged within the last 7 days.
 */
export function needsFollowUp(app: Application, today: string, cadenceDays = FOLLOW_UP_CADENCE_DAYS): boolean {
  if (app.status !== 'applied') return false
  const applied = appliedDate(app)
  if (!applied) return false
  if (hasResponse(app)) return false
  if (daysBetween(applied, today) < cadenceDays) return false

  const followUps = liveEvents(app, 'follow_up')
  const last = followUps[followUps.length - 1]
  if (last && daysBetween(last.date, today) < cadenceDays) return false
  return true
}

/**
 * "Remind me" capture intent: a saved application whose remind date has
 * arrived. Applied apps are covered by needsFollowUp instead.
 */
export function reminderDue(app: Application, today: string): boolean {
  return app.status === 'saved' && !!app.remind_at && app.remind_at <= today
}
