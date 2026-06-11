import type { RoleType } from './types'
import type { ImportError } from './types'

// The baseline is everything the agent is allowed to write from.
// CV is the single source of truth; voice samples calibrate register;
// constraints keep targeting honest. Nothing here, nothing in a letter.

export interface VoiceSample {
  title?: string
  text: string
}

export interface BaselineLink {
  label: string
  url: string
}

export type RemotePreference = 'remote_only' | 'hybrid_ok' | 'onsite_ok'

export interface BaselineConstraints {
  location?: string
  remote?: RemotePreference
  salary_floor?: number
  role_types_in: RoleType[]
  visa?: string
  notes?: string
}

export interface Baseline {
  /** Raw JSON Resume text, stored verbatim — the single source of truth. */
  cv_json?: string
  voice_samples: VoiceSample[]
  links: BaselineLink[]
  constraints: BaselineConstraints
  template: 'ats-job-docs'
  updated_at?: string
}

export function emptyBaseline(): Baseline {
  return {
    voice_samples: [],
    links: [],
    constraints: { role_types_in: [] },
    template: 'ats-job-docs',
  }
}

export interface CVSummary {
  name: string
  email?: string
  workCount: number
  skillCount: number
  profiles: BaselineLink[]
}

export type CVValidation =
  | { ok: true; summary: CVSummary }
  | { ok: false; errors: ImportError[] }

/** Lenient JSON Resume check: parseable object with basics.name. Never throws. */
export function validateCVJson(raw: string): CVValidation {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { ok: false, errors: [{ path: '$', message: `invalid JSON: ${(e as Error).message}` }] }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: [{ path: '$', message: 'expected a JSON Resume object' }] }
  }
  const cv = parsed as Record<string, unknown>
  const basics = (typeof cv.basics === 'object' && cv.basics !== null ? cv.basics : {}) as Record<string, unknown>
  const name = typeof basics.name === 'string' ? basics.name.trim() : ''
  if (!name) {
    return { ok: false, errors: [{ path: '$.basics.name', message: 'JSON Resume needs basics.name' }] }
  }

  const profiles: BaselineLink[] = []
  if (Array.isArray(basics.profiles)) {
    for (const p of basics.profiles) {
      if (typeof p !== 'object' || p === null) continue
      const r = p as Record<string, unknown>
      const url = typeof r.url === 'string' ? r.url : ''
      if (!url) continue
      const label = typeof r.network === 'string' && r.network ? r.network : new URL(url).hostname
      profiles.push({ label, url })
    }
  }

  const summary: CVSummary = {
    name,
    workCount: Array.isArray(cv.work) ? cv.work.length : 0,
    skillCount: Array.isArray(cv.skills) ? cv.skills.length : 0,
    profiles,
  }
  if (typeof basics.email === 'string' && basics.email) summary.email = basics.email
  return { ok: true, summary }
}

export interface BaselineStatus {
  /** Ready = the agent has facts (CV) and a target (role types). */
  ready: boolean
  missing: string[]
  /** Worth having, not blocking: voice calibration, links. */
  recommended: string[]
}

export function baselineStatus(b: Baseline): BaselineStatus {
  const missing: string[] = []
  const recommended: string[] = []

  if (!b.cv_json || !validateCVJson(b.cv_json).ok) missing.push('cv')
  if (b.constraints.role_types_in.length === 0) missing.push('role targeting')
  if (b.voice_samples.length === 0) recommended.push('voice samples')
  if (b.links.length === 0) recommended.push('links')

  return { ready: missing.length === 0, missing, recommended }
}
