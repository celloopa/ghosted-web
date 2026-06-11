import type { Application, GroupStats, Stats } from './types'
import { appliedDate } from './derived'
import { daysBetween } from './dates'

export const LOW_DATA_THRESHOLD = 5

const KNOWN_SOURCES: Record<string, string> = {
  'boards.greenhouse.io': 'greenhouse',
  'greenhouse.io': 'greenhouse',
  'jobs.lever.co': 'lever',
  'lever.co': 'lever',
  'linkedin.com': 'linkedin',
  'jobs.ashbyhq.com': 'ashby',
  'ashbyhq.com': 'ashby',
  'wellfound.com': 'wellfound',
  'indeed.com': 'indeed',
  'myworkdayjobs.com': 'workday',
}

/** Friendly source name from a job URL host; undefined if unparseable. */
export function deriveSource(jobUrl: string): string | undefined {
  let host: string
  try {
    host = new URL(jobUrl).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
  if (!host) return undefined
  if (KNOWN_SOURCES[host]) return KNOWN_SOURCES[host]
  for (const [known, name] of Object.entries(KNOWN_SOURCES)) {
    if (host.endsWith('.' + known)) return name
  }
  return host
}

function live(app: Application, ...types: string[]) {
  return app.events.filter((e) => !e.corrected && types.includes(e.type))
}

/** Has been applied at all — saved-only applications don't enter rate math. */
function wasApplied(app: Application): boolean {
  return app.status !== 'saved' && appliedDate(app) !== undefined
}

function responded(app: Application): boolean {
  if (live(app, 'response', 'interview').length > 0) return true
  // Reaching these states implies the company responded, even if the event
  // wasn't logged — keeps stats honest for terse users.
  return app.status === 'interviewing' || app.status === 'offer' || app.closed_reason === 'accepted'
}

function interviewed(app: Application): boolean {
  if (live(app, 'interview').length > 0) return true
  return app.status === 'interviewing' || app.status === 'offer' || app.closed_reason === 'accepted'
}

function daysToFirstResponse(app: Application): number | null {
  const applied = appliedDate(app)
  if (!applied) return null
  const first = live(app, 'response', 'interview').sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!first) return null
  return daysBetween(applied, first.date)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function groupBy(apps: Application[], key: (app: Application) => string): GroupStats[] {
  const groups = new Map<string, Application[]>()
  for (const app of apps) {
    const k = key(app)
    groups.set(k, [...(groups.get(k) ?? []), app])
  }
  const out: GroupStats[] = []
  for (const [k, members] of groups) {
    const applied = members.filter(wasApplied)
    const total = applied.length
    const responses = applied.filter(responded).length
    const interviews = applied.filter(interviewed).length
    out.push({
      key: k,
      total,
      responses,
      interviews,
      responseRate: total === 0 ? null : responses / total,
      interviewRate: total === 0 ? null : interviews / total,
      medianDaysToFirstResponse: median(
        applied.map(daysToFirstResponse).filter((d): d is number => d !== null),
      ),
      lowData: total < LOW_DATA_THRESHOLD,
    })
  }
  return out.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
}

/**
 * The stats screen IS this function — the UI renders its output verbatim
 * (M4: same function, no reimplementation).
 */
export function computeStats(apps: Application[]): Stats {
  if (apps.length === 0) {
    return { byRoleType: [], bySource: [], byResumeVersion: [] }
  }
  return {
    byRoleType: groupBy(apps, (a) => a.role_type),
    bySource: groupBy(apps, (a) => a.source ?? 'unclassified'),
    byResumeVersion: groupBy(apps, (a) => a.resume_version ?? 'unclassified'),
  }
}
