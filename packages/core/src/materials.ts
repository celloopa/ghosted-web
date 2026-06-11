// Resume tailoring is mostly arithmetic: bullets ranked by keyword overlap,
// skills reordered by posting relevance. The agent's only jobs are the
// summary line and the cover letter — see generate.ts.

import type { Materials } from './types'

export interface RewriteAcceptanceCounts {
  accepted: number
  edited: number
  rejected: number
  undecided: number
  total: number
}

/**
 * Derives rewrite acceptance counts from materials. Tolerates missing fields.
 * "edited" counts as accepted AND edited (both flags set). Undecided = total - decided.
 */
export function rewriteAcceptance(materials: Materials | undefined | null): RewriteAcceptanceCounts {
  const rewrites = materials?.resume_rewrites ?? []
  const decisions = materials?.rewrite_decisions ?? {}
  const total = rewrites.length

  let accepted = 0
  let edited = 0
  let rejected = 0

  for (let i = 0; i < total; i++) {
    const d = decisions[i]
    if (!d) continue
    if (d.status === 'rejected') {
      rejected += 1
    } else if (d.status === 'accepted') {
      accepted += 1
      if (d.edited !== undefined) edited += 1
    }
  }

  const decided = accepted + rejected
  const undecided = total - decided
  return { accepted, edited, rejected, undecided, total }
}

/** A draft is sendable when finalized_at is stamped. */
export function isSendable(materials: Materials | undefined | null): boolean {
  return typeof materials?.finalized_at === 'string' && materials.finalized_at.length > 0
}

export interface RankedBullet {
  text: string
  score: number
  originalIndex: number
}

export interface ResumeRolePlan {
  name: string
  position?: string
  order: RankedBullet[]
  changed: boolean
}

export interface ResumePlan {
  roles: ResumeRolePlan[]
  skills_order: string[]
  skills_changed: boolean
}

function hits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  let n = 0
  for (const k of keywords) {
    if (lower.includes(k.toLowerCase())) n += 1
  }
  return n
}

export function planResume(cvJson: string, keywords: string[]): ResumePlan {
  let cv: Record<string, unknown>
  try {
    cv = JSON.parse(cvJson) as Record<string, unknown>
  } catch {
    return { roles: [], skills_order: [], skills_changed: false }
  }
  if (typeof cv !== 'object' || cv === null) return { roles: [], skills_order: [], skills_changed: false }

  const roles: ResumeRolePlan[] = []
  for (const w of Array.isArray(cv.work) ? cv.work : []) {
    if (typeof w !== 'object' || w === null) continue
    const work = w as Record<string, unknown>
    const highlights = Array.isArray(work.highlights) ? work.highlights.filter((h): h is string => typeof h === 'string') : []
    if (highlights.length === 0) continue
    const ranked: RankedBullet[] = highlights.map((text, originalIndex) => ({
      text,
      score: hits(text, keywords),
      originalIndex,
    }))
    // Stable: score desc, original order as tiebreak.
    const order = [...ranked].sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    const role: ResumeRolePlan = {
      name: typeof work.name === 'string' ? work.name : 'Role',
      order,
      changed: order.some((b, i) => b.originalIndex !== i),
    }
    if (typeof work.position === 'string') role.position = work.position
    roles.push(role)
  }

  const skillNames: string[] = []
  for (const s of Array.isArray(cv.skills) ? cv.skills : []) {
    if (typeof s === 'object' && s !== null && typeof (s as Record<string, unknown>).name === 'string') {
      skillNames.push((s as Record<string, unknown>).name as string)
    }
  }
  const skillRank = skillNames.map((name, i) => ({ name, i, hit: hits(name, keywords) > 0 }))
  const skills_order = [...skillRank].sort((a, b) => Number(b.hit) - Number(a.hit) || a.i - b.i).map((s) => s.name)

  return {
    roles,
    skills_order,
    skills_changed: skills_order.some((name, i) => name !== skillNames[i]),
  }
}

export interface RenderOptions {
  /** The one LLM-written line. Absent → an explicit placeholder, never fabricated. */
  summary?: string
  /** Posting skills the CV does not cover — named honestly, not papered over. */
  missing?: string[]
}

export function renderResumeAdjustments(plan: ResumePlan, opts: RenderOptions = {}): string {
  const lines: string[] = []
  lines.push('# Resume adjustments')
  lines.push('')
  lines.push('Allowed edits only: summary rewrite, bullet reorder, skills reorder.')
  lines.push('')

  lines.push('## Summary')
  lines.push('')
  lines.push(opts.summary ?? '_Pending — generate to draft the summary line._')
  lines.push('')

  lines.push('## Bullet order')
  lines.push('')
  const changedRoles = plan.roles.filter((r) => r.changed)
  if (changedRoles.length === 0) {
    lines.push('No reordering needed — the relevant bullets already lead.')
  }
  for (const role of changedRoles) {
    lines.push(`**${role.name}**${role.position ? ` — ${role.position}` : ''}`)
    role.order.forEach((b, i) => {
      const moved = b.originalIndex !== i ? ` _(was #${b.originalIndex + 1})_` : ''
      lines.push(`${i + 1}. ${b.text}${moved}`)
    })
    lines.push('')
  }

  lines.push('## Skills order')
  lines.push('')
  lines.push(plan.skills_changed ? plan.skills_order.join(' · ') : 'Unchanged — already leads with the relevant skills.')
  lines.push('')

  lines.push('## What this did NOT change, and why')
  lines.push('')
  lines.push('No roles, dates, employers, metrics, or tools were added or altered.')
  if (opts.missing && opts.missing.length > 0) {
    lines.push(
      `The posting also asks for: ${opts.missing.join(', ')}. The CV has no evidence for these — leaving them out is the honest move.`,
    )
  }
  return lines.join('\n')
}
