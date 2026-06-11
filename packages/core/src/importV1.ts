import type { Application, ApplicationEvent, ClosedReason, ImportError, ImportResult, RoleType, Status } from './types'
import { deriveSource } from './stats'

// v1 (Go ghosted) and ghosted2 statuses → v2 status (+ closed_reason, + synthetic events)
const STATUS_MAP: Record<string, { status: Status; closed_reason?: ClosedReason; response?: boolean; interview?: boolean }> = {
  // v1 TUI statuses
  applied: { status: 'applied' },
  screening: { status: 'applied', response: true },
  interview: { status: 'interviewing', response: true, interview: true },
  offer: { status: 'offer', response: true },
  accepted: { status: 'closed', closed_reason: 'accepted', response: true },
  rejected: { status: 'closed', closed_reason: 'rejected' },
  withdrawn: { status: 'closed', closed_reason: 'withdrawn' },
  // ghosted2 CLI extras
  tracked: { status: 'saved' },
  saved: { status: 'saved' },
  ghosted: { status: 'applied' }, // derived logic re-discovers the ghost
  interviewing: { status: 'interviewing', response: true },
  closed: { status: 'closed', closed_reason: 'rejected' },
}

const ROLE_TYPES: RoleType[] = ['design_engineer', 'product_designer', 'brand_motion', 'other']

/**
 * Maps a v1 applications.json export onto the v2 model: 8 manual statuses
 * become 5 + closed_reason + synthesized events, with the original status
 * preserved in a provenance note. Returns typed errors — never throws.
 */
export function parseV1Import(json: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    return { ok: false, errors: [{ path: '$', message: `invalid JSON: ${(e as Error).message}` }] }
  }
  if (!Array.isArray(raw)) {
    return { ok: false, errors: [{ path: '$', message: 'expected a JSON array of applications' }] }
  }

  const applications: Application[] = []
  const warnings: string[] = []
  const errors: ImportError[] = []

  raw.forEach((item, i) => {
    const path = `$[${i}]`
    if (typeof item !== 'object' || item === null) {
      errors.push({ path, message: 'not an object' })
      return
    }
    const rec = item as Record<string, unknown>
    const company = str(rec.company)
    const position = str(rec.position)
    if (!company || !position) {
      errors.push({ path: `${path}`, message: 'missing required company/position' })
      return
    }
    const v1Status = str(rec.status) ?? 'applied'
    const mapped = STATUS_MAP[v1Status]
    if (!mapped) {
      errors.push({ path: `${path}.status`, message: `unknown status ${JSON.stringify(rec.status)}` })
      return
    }

    const dateApplied = isoDate(rec.date_applied)
    const fallbackDate = dateApplied ?? isoDate(rec.created_at) ?? isoDate(rec.updated_at)
    const events: ApplicationEvent[] = []

    if (dateApplied && mapped.status !== 'saved') {
      events.push({ type: 'applied', date: dateApplied })
    }
    if (mapped.response) {
      const responseDate = isoDate(rec.updated_at) ?? fallbackDate
      if (responseDate) {
        events.push({ type: 'response', date: responseDate, detail: 'response (date approximate, imported from v1)' })
        warnings.push(`${path}: response date approximated from updated_at`)
      }
    }
    for (const iv of Array.isArray(rec.interviews) ? rec.interviews : []) {
      if (typeof iv !== 'object' || iv === null) continue
      const r = iv as Record<string, unknown>
      const date = isoDate(r.date) ?? fallbackDate
      if (!date) continue
      const detail = [str(r.type), str(r.with_whom), str(r.notes)].filter(Boolean).join(' — ')
      events.push({ type: 'interview', date, detail: detail || 'interview (imported from v1)' })
    }
    // Provenance: the import is lossless because the original status survives.
    if (fallbackDate) {
      events.push({ type: 'note', date: fallbackDate, detail: `imported from v1 (status: ${v1Status})` })
    }

    const jobUrl = str(rec.job_url)
    const roleType = ROLE_TYPES.includes(rec.role_type as RoleType) ? (rec.role_type as RoleType) : 'other'

    const app: Application = {
      id: str(rec.id) ?? `import-${i}`,
      company,
      position,
      role_type: roleType,
      status: mapped.status,
      events: events.sort((a, b) => a.date.localeCompare(b.date)),
    }
    if (mapped.closed_reason) app.closed_reason = mapped.closed_reason
    if (dateApplied) app.date_applied = dateApplied
    if (jobUrl) {
      app.job_url = jobUrl
      const source = deriveSource(jobUrl)
      if (source) app.source = source
    }
    if (typeof rec.salary_min === 'number' && rec.salary_min > 0) app.salary_min = rec.salary_min
    if (typeof rec.salary_max === 'number' && rec.salary_max > 0) app.salary_max = rec.salary_max
    if (str(rec.location)) app.location = str(rec.location)!
    if (typeof rec.remote === 'boolean') app.remote = rec.remote
    if (str(rec.resume_version)) app.resume_version = str(rec.resume_version)!
    if (str(rec.notes)) app.notes = str(rec.notes)!

    applications.push(app)
  })

  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return { ok: true, applications, warnings }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function isoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = Date.parse(v)
  if (Number.isNaN(t)) return undefined
  return v
}
