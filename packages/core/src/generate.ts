// The bounded LLM call. Code builds the prompt, code parses the response,
// code validates the result (word cap, banned phrases). The model may reword
// existing CV evidence, draft a cover letter, and suggest standout moves, but
// it must not invent roles, tools, dates, metrics, or experience.

export const BANNED_PHRASES = [
  "i'm excited to",
  'aligns perfectly',
  'passionate about',
  'leverage my skills',
  'fast-paced environment',
  'hit the ground running',
  'i believe i would be a great fit',
]

export const LETTER_WORD_LIMIT = 180

export interface GenerationInput {
  company: string
  position: string
  descriptionExcerpt: string
  matched: string[]
  missing: string[]
  cvJson: string
  voiceSamples: string[]
  constraintNotes?: string
}

export interface ResumeRewriteSuggestion {
  source: string
  rewrite: string
  why: string
}

export interface OpportunityAngle {
  title: string
  evidence: string
  use: string
}

export interface StandoutSuggestion {
  title: string
  action: string
  effort: 'low' | 'medium' | 'high'
}

export interface GeneratedMaterialsDraft {
  summary: string
  cover_letter: string
  resume_rewrites: ResumeRewriteSuggestion[]
  opportunity_angles: OpportunityAngle[]
  standout_suggestions: StandoutSuggestion[]
}

export interface GenerationRevision {
  current: Partial<GeneratedMaterialsDraft>
  instruction: string
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

export function buildGenerationPrompt(input: GenerationInput, revision?: GenerationRevision): string {
  const voice =
    input.voiceSamples.length > 0
      ? `Match the register of these past letters the candidate would send again:\n${input.voiceSamples
          .map((v, i) => `--- sample ${i + 1} ---\n${clip(v, 2500)}`)
          .join('\n')}`
      : 'No voice samples provided — write plainly and specifically; correct beats colorful.'

  const revisionBlock = revision
    ? `\nThis is a REVISION. Current draft JSON:\n${JSON.stringify(revision.current, null, 2)}\n\nRevision instruction from the candidate: ${revision.instruction}\nApply the instruction; keep everything else that works.\n`
    : ''

  return `You are preparing job application materials for a designer who codes.
The app already computed keywords, fit, gaps, and deterministic resume ordering.
Your job is to help the candidate EDIT from strong suggestions, not write from blank.

Job: ${input.position} at ${input.company}
Posting excerpt:
${clip(input.descriptionExcerpt, 6000)}

Candidate CV (JSON Resume — the single source of truth, never invent beyond it):
${clip(input.cvJson, 12000)}

Skills overlap (computed): CV covers ${input.matched.join(', ') || 'none of the named skills'}.
Gaps (do NOT fabricate these): ${input.missing.join(', ') || 'none'}.
${input.constraintNotes ? `Candidate notes: ${input.constraintNotes}` : ''}
${voice}
${revisionBlock}
Hard rules:
- cover_letter: HARD LIMIT ${LETTER_WORD_LIMIT} words including any sign-off. Count before answering; cut until under.
- cover_letter must contain one specific, verifiable fact about ${input.company} AND one concrete project match from the CV.
- summary: one resume summary line (≤40 words) mirroring the posting's language — truthful to the CV only.
- resume_rewrites: 3 to 5 suggested rewrites of existing CV bullets or summary language. Each must include source, rewrite, why. Reword only existing evidence.
- opportunity_angles: 3 ways to frame the candidate for this role. Each must include title, evidence from the CV, and where to use it.
- standout_suggestions: 3 practical ways to stand out beyond resume/cover letter. Each must include title, action, effort. Do not suggest spammy outreach.
- Transplant test: if the letter or angles would make sense sent to a different company, rewrite before answering.
- Banned phrases: ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')}.
- Never invent roles, dates, employers, metrics, tools, case studies, contacts, or company facts.

Respond with ONLY a JSON object, no code fences, no prose:
{"summary":"...","cover_letter":"...","resume_rewrites":[{"source":"...","rewrite":"...","why":"..."}],"opportunity_angles":[{"title":"...","evidence":"...","use":"..."}],"standout_suggestions":[{"title":"...","action":"...","effort":"low"}]}`
}

export type GenerationResult =
  | ({ ok: true } & GeneratedMaterialsDraft)
  | { ok: false; error: string }

function stringField(rec: Record<string, unknown>, key: string): string | null {
  const v = rec[key]
  return typeof v === 'string' ? v.trim() : null
}

function parseStringObjects<T extends object>(value: unknown, keys: (keyof T & string)[], max: number): T[] {
  if (!Array.isArray(value)) return []
  const out: T[] = []
  for (const item of value.slice(0, max)) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const next: Record<string, string> = {}
    let ok = true
    for (const key of keys) {
      const v = rec[String(key)]
      if (typeof v !== 'string' || !v.trim()) {
        ok = false
        break
      }
      next[String(key)] = v.trim()
    }
    if (ok) out.push(next as T)
  }
  return out
}

export function parseGeneration(raw: string): GenerationResult {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object in model response' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch (e) {
    return { ok: false, error: `model response was not valid JSON: ${(e as Error).message}` }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'unexpected response shape' }
  const rec = parsed as Record<string, unknown>
  const summary = stringField(rec, 'summary')
  const cover_letter = stringField(rec, 'cover_letter')
  if (!summary || !cover_letter) return { ok: false, error: 'response missing summary or cover_letter' }

  return {
    ok: true,
    summary,
    cover_letter,
    resume_rewrites: parseStringObjects<ResumeRewriteSuggestion>(rec.resume_rewrites, ['source', 'rewrite', 'why'], 5),
    opportunity_angles: parseStringObjects<OpportunityAngle>(rec.opportunity_angles, ['title', 'evidence', 'use'], 5),
    standout_suggestions: parseStringObjects<StandoutSuggestion>(rec.standout_suggestions, ['title', 'action', 'effort'], 5).map((s) => ({
      ...s,
      effort: s.effort === 'high' || s.effort === 'medium' ? s.effort : 'low',
    })),
  }
}

export type RevisionTarget = 'cover_letter' | 'summary'

export interface TargetedRevisionOpts {
  target: RevisionTarget
  current: string
  instruction: string
}

export type TargetedRevisionResult = { ok: true; value: string } | { ok: false; error: string }

/**
 * Builds a focused prompt that revises ONLY one piece and returns ONLY that piece.
 * The model must respond with `{"cover_letter":"..."}` or `{"summary":"..."}`.
 */
export function buildTargetedRevisionPrompt(input: GenerationInput, opts: TargetedRevisionOpts): string {
  const { target, current, instruction } = opts

  const targetRules =
    target === 'cover_letter'
      ? `Hard rules for cover_letter:
- HARD LIMIT ${LETTER_WORD_LIMIT} words including any sign-off. Count before answering; cut until under.
- Must contain one specific, verifiable fact about ${input.company} AND one concrete project match from the CV.
- Transplant test: if this letter would make sense sent to a different company, rewrite before answering.
- Banned phrases (must not appear): ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')}.
- Never invent roles, dates, employers, metrics, tools, case studies, contacts, or company facts.`
      : `Hard rules for summary:
- One resume summary line, ≤40 words maximum.
- Mirror the posting's language; truthful to the CV only.
- Never invent roles, dates, employers, metrics, tools, or experience.`

  return `You are revising a single field in a job application for a designer who codes.
Job: ${input.position} at ${input.company}
Posting excerpt:
${clip(input.descriptionExcerpt, 3000)}

Candidate CV (JSON Resume — the single source of truth, never invent beyond it):
${clip(input.cvJson, 8000)}

Current ${target}:
${current}

Revision instruction from the candidate: ${instruction}

${targetRules}

Apply the instruction to the current ${target}. Change NOTHING ELSE about any other field.
Respond with ONLY a JSON object containing the single revised field, no code fences, no prose:
{"${target}":"..."}`
}

/**
 * Lenient parser for targeted revision responses.
 * Pulls only the target key's string value.
 */
export function parseTargetedRevision(raw: string, target: RevisionTarget): TargetedRevisionResult {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object in model response' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch (e) {
    return { ok: false, error: `model response was not valid JSON: ${(e as Error).message}` }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'unexpected response shape' }
  const rec = parsed as Record<string, unknown>
  const value = rec[target]
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `response missing or empty "${target}" field` }
  }
  return { ok: true, value: value.trim() }
}

export interface LetterCheck {
  words: number
  overLimit: boolean
  banned: string[]
}

/** Deterministic validation of the model's letter — code checks the agent. */
export function checkCoverLetter(letter: string): LetterCheck {
  const words = letter.trim() === '' ? 0 : letter.trim().split(/\s+/).length
  const lower = letter.toLowerCase().replace(/[‘’]/g, "'")
  const banned = BANNED_PHRASES.filter((p) => lower.includes(p))
  return { words, overLimit: words > LETTER_WORD_LIMIT + 15, banned }
}
