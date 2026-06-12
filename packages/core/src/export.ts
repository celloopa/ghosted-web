// export.ts — pure, deterministic functions for building the typed ResumeModel and
// ATS expectations from a JSON Resume string and agent-supplied overrides.
// No I/O, no Node APIs, no framework imports — fully testable in vitest.

import { keywordVariantIn } from './analyze'

/**
 * Document style preferences passed through the export pipeline.
 * template: 'modern' uses @preview/modern-cv:0.9.0; 'plain-ats' uses the hand-rolled template.
 * accentColor: 6-digit hex with leading #; ignored if invalid.
 * font: font family name to inject; ≤60 chars, letters/digits/space/hyphen only.
 */
export interface DocStyle {
  template: 'modern' | 'plain-ats'
  font?: string
  accentColor?: string
}

const ACCENT_RE = /^#[0-9a-fA-F]{6}$/
const FONT_RE = /^[a-zA-Z0-9 -]{1,60}$/

/**
 * Coerce an unknown input into a valid DocStyle.
 * Defaults: template → 'modern', invalid accentColor → dropped, invalid font → dropped.
 */
export function normalizeDocStyle(input: unknown): DocStyle {
  if (typeof input !== 'object' || input === null) {
    return { template: 'modern' }
  }
  const raw = input as Record<string, unknown>

  const template: DocStyle['template'] =
    raw.template === 'plain-ats' ? 'plain-ats' : 'modern'

  const accentColor =
    typeof raw.accentColor === 'string' && ACCENT_RE.test(raw.accentColor)
      ? raw.accentColor
      : undefined

  const font =
    typeof raw.font === 'string' && FONT_RE.test(raw.font.trim())
      ? raw.font.trim()
      : undefined

  return { template, ...(accentColor ? { accentColor } : {}), ...(font ? { font } : {}) }
}

/** A single link shown in the resume header. */
export interface ResumeLink {
  label: string
  url: string
}

/** A single work entry with reordered/filtered highlights. */
export interface ResumeWorkEntry {
  name: string
  position?: string
  start?: string
  end?: string
  highlights: string[]
}

/** An education entry. */
export interface ResumeEducationEntry {
  institution: string
  area?: string
  year?: string
}

/**
 * The typed resume model produced from cv.json + agent overrides.
 * Consumed by generateResumeTyp on the server side.
 */
export interface ResumeModel {
  name: string
  email: string
  phone?: string
  location?: string
  links: ResumeLink[]
  summary: string
  work: ResumeWorkEntry[]
  skills: string[]
  education: ResumeEducationEntry[]
  /** Fields used only by the modern-cv template. */
  modern?: {
    firstname: string
    lastname: string
    homepage?: string
    github?: string
    linkedin?: string
    positions: string[]
  }
}

/**
 * The expectations.json schema consumed by validate_ats.py in resume mode.
 */
export interface AtsExpectations {
  required_strings: string[]
  ordered_headings: string[]
  required_keywords: string[]
  required_years: string[]
  max_pages: number
}

/**
 * Escape a string so it is safe to embed as typst content.
 * Typst special chars that need escaping inside content strings:
 *   \ # $ @ ` " (also angle brackets in markup mode)
 * We escape for embedding inside double-quoted string literals.
 */
export function typstEscape(s: string): string {
  return (
    s
      // Backslash must go first
      .replace(/\\/g, '\\\\')
      // Hash introduces markup / commands
      .replace(/#/g, '\\#')
      // Dollar introduces math mode
      .replace(/\$/g, '\\$')
      // Double-quote closes the string literal
      .replace(/"/g, '\\"')
      // At-sign can trigger labels
      .replace(/@/g, '\\@')
      // Backtick introduces raw blocks
      .replace(/`/g, '\\`')
      // Angle brackets are markup in content
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
  )
}

// ─────────────────────────────────────────────
// Internal helpers for parsing JSON Resume
// ─────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

/**
 * Apply bulletOrder overrides to a highlights list.
 * order is a list of original-index integers; entries not mentioned keep
 * their original relative order at the end.
 */
function applyBulletOrder(highlights: string[], order: number[]): string[] {
  const result: string[] = []
  const seen = new Set<number>()
  for (const idx of order) {
    if (idx >= 0 && idx < highlights.length && !seen.has(idx)) {
      result.push(highlights[idx]!)
      seen.add(idx)
    }
  }
  // Append any remaining in original order
  for (let i = 0; i < highlights.length; i++) {
    if (!seen.has(i)) result.push(highlights[i]!)
  }
  return result
}

/**
 * Build a 4-character year string from a JSON Resume date string.
 * Accepts "2022", "2022-01", "2022-01-15", etc.
 */
function extractYear(d: string | undefined): string | undefined {
  if (!d) return undefined
  const m = d.match(/^(\d{4})/)
  return m ? m[1] : undefined
}

/**
 * Format a date string for display. Returns the year only (for brevity in the
 * rendered resume). An empty / absent date returns "Present".
 */
function fmtDate(d: string | undefined | null): string {
  if (!d || d.trim() === '') return 'Present'
  const year = extractYear(d)
  return year ?? d
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface BulletOrderOverride {
  /** Work entry name (must match exactly). */
  name: string
  /** List of original highlight indexes in desired output order. */
  order: number[]
}

export interface BuildResumeModelOptions {
  /** LLM-written summary line (≤40 words). Falls back to CV summary. */
  summary?: string
  /** Per-role bullet reordering. */
  bulletOrder?: BulletOrderOverride[]
  /** Ordered list of skill names (agent may reorder for the posting). */
  skillsOrder?: string[]
}

/**
 * Parse a JSON Resume string and produce a typed ResumeModel.
 *
 * Returns null when cvJson is not parseable or is missing required fields
 * (name, email).
 */
export function buildResumeModel(cvJson: string, opts: BuildResumeModelOptions = {}): ResumeModel | null {
  let cv: unknown
  try {
    cv = JSON.parse(cvJson)
  } catch {
    return null
  }
  if (typeof cv !== 'object' || cv === null) return null

  const root = cv as Record<string, unknown>
  const basics = typeof root.basics === 'object' && root.basics !== null ? (root.basics as Record<string, unknown>) : {}

  const name = str(basics.name)
  const email = str(basics.email)
  if (!name || !email) return null

  const phone = str(basics.phone)
  const loc = (basics.location as Record<string, unknown> | undefined) ?? {}
  const city = str(loc.city)
  const region = str(loc.region)
  const location = city && region ? `${city}, ${region}` : city ?? region ?? str(basics.location as unknown)

  // Links: website URL + social profiles
  const links: ResumeLink[] = []
  const websiteUrl = str(basics.url)
  if (websiteUrl) {
    links.push({ label: websiteUrl.replace(/^https?:\/\//, ''), url: websiteUrl })
  }
  const profiles = Array.isArray(basics.profiles) ? basics.profiles : []
  for (const p of profiles) {
    if (typeof p !== 'object' || p === null) continue
    const prof = p as Record<string, unknown>
    const pUrl = str(prof.url)
    const network = str(prof.network)
    const username = str(prof.username)
    if (pUrl) {
      links.push({ label: username ?? network ?? pUrl.replace(/^https?:\/\//, ''), url: pUrl })
    }
  }

  // Summary: agent-supplied takes priority over CV summary.
  const summary = opts.summary ?? str(basics.summary) ?? ''

  // Work entries
  const bulletOrderMap = new Map<string, number[]>()
  for (const bo of opts.bulletOrder ?? []) {
    bulletOrderMap.set(bo.name, bo.order)
  }

  const work: ResumeWorkEntry[] = []
  for (const w of Array.isArray(root.work) ? root.work : []) {
    if (typeof w !== 'object' || w === null) continue
    const entry = w as Record<string, unknown>
    const wName = str(entry.name)
    if (!wName) continue
    let highlights = strArr(entry.highlights)
    const bo = bulletOrderMap.get(wName)
    if (bo) highlights = applyBulletOrder(highlights, bo)

    work.push({
      name: wName,
      position: str(entry.position),
      start: str(entry.startDate),
      end: str(entry.endDate),
      highlights,
    })
  }

  // Skills
  let skills: string[]
  if (opts.skillsOrder && opts.skillsOrder.length > 0) {
    skills = opts.skillsOrder.filter((s) => typeof s === 'string' && s.trim().length > 0)
  } else {
    skills = []
    for (const s of Array.isArray(root.skills) ? root.skills : []) {
      if (typeof s !== 'object' || s === null) continue
      const skillName = str((s as Record<string, unknown>).name)
      if (skillName) skills.push(skillName)
    }
  }

  // Education
  const education: ResumeEducationEntry[] = []
  for (const e of Array.isArray(root.education) ? root.education : []) {
    if (typeof e !== 'object' || e === null) continue
    const edu = e as Record<string, unknown>
    const institution = str(edu.institution)
    if (!institution) continue
    const endYear = extractYear(str(edu.endDate))
    const startYear = extractYear(str(edu.startDate))
    const year = endYear ?? startYear
    education.push({
      institution,
      area: str(edu.area),
      year,
    })
  }

  // ── modern-cv specific fields ──────────────────────────────────────────────
  // Split name on last space: "Marcelo Rondon" → firstname "Marcelo", lastname "Rondon"
  const nameParts = name.split(' ')
  const lastname = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : name
  const firstname = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''

  // Homepage: basics.url
  const homepage = websiteUrl ?? undefined

  // Github/LinkedIn: parse from profiles
  let github: string | undefined
  let linkedin: string | undefined
  for (const p of profiles) {
    if (typeof p !== 'object' || p === null) continue
    const prof = p as Record<string, unknown>
    const pUrl = str(prof.url) ?? ''
    const username = str(prof.username)
    const network = (str(prof.network) ?? '').toLowerCase()
    // GitHub
    if (!github) {
      const ghMatch = pUrl.match(/github\.com\/([^/?\s]+)/)
      if (ghMatch) github = ghMatch[1]
      else if (network === 'github' && username) github = username
    }
    // LinkedIn
    if (!linkedin) {
      const liMatch = pUrl.match(/linkedin\.com\/in\/([^/?\s]+)/)
      if (liMatch) linkedin = liMatch[1]
      else if (network === 'linkedin' && username) linkedin = username
    }
  }

  // Positions: from basics.label, split on ' · ' or fall back to single entry
  const labelStr = str(basics.label as unknown)
  const positions: string[] = labelStr
    ? labelStr.split(/\s*·\s*/).filter(Boolean)
    : []

  const modern = {
    firstname,
    lastname,
    ...(homepage ? { homepage } : {}),
    ...(github ? { github } : {}),
    ...(linkedin ? { linkedin } : {}),
    positions,
  }

  return { name, email, phone, location, links, summary, work, skills, education, modern }
}

/**
 * Build the expectations.json object consumed by validate_ats.py.
 *
 * - required_strings: at minimum [name, email]
 * - ordered_headings: always ["Experience", "Skills", "Education"]
 * - required_keywords: up to 5 unique terms, resolved to the alias surface form
 *   actually present in the rendered resume rather than the canonical label.
 *   Terms whose canonical and all aliases are absent from the resume are dropped
 *   (asserting the impossible causes false negatives in the validator).
 *   Terms not in the LEXICON are included lowercased only if they literally
 *   appear in the haystack.
 * - required_years: unique 4-digit years found across work start/end dates
 * - max_pages: 2
 *
 * @param model           Typed resume model.
 * @param matchedKeywords Canonical keyword terms from extractKeywords.
 * @param renderedText    Plain-text assembled from exactly the strings the
 *   generator rendered into the document. When supplied this is used as the
 *   keyword haystack instead of the model fields, so that only keywords that
 *   actually appear in the PDF can end up in required_keywords.
 *   Obtain it from generateResumeTyp(model, style).plainText.
 *   Falls back to deriving the haystack from model fields when omitted (legacy
 *   call-sites and tests that construct expectations without a generator).
 */
export function buildExpectations(
  model: ResumeModel,
  matchedKeywords: string[],
  renderedText?: string,
): AtsExpectations {
  const requiredStrings: string[] = [model.name]
  if (model.email) requiredStrings.push(model.email)

  // Haystack: prefer the rendered plainText from the generator (exact set of
  // strings that reached the PDF). Fall back to deriving from model fields for
  // call-sites that don't yet pass renderedText (legacy / unit test fixtures).
  let haystack: string
  if (renderedText !== undefined && renderedText.length > 0) {
    haystack = renderedText.toLowerCase()
  } else {
    const haystackParts: string[] = [model.summary]
    for (const w of model.work) {
      if (w.position) haystackParts.push(w.position)
      haystackParts.push(...w.highlights)
    }
    haystackParts.push(...model.skills)
    haystack = haystackParts.join(' ').toLowerCase()
  }

  // Resolve each matched keyword to the alias surface form present in the
  // resume. De-duplicate and cap at 5 AFTER filtering absent terms.
  const seen = new Set<string>()
  const requiredKeywords: string[] = []
  for (const kw of matchedKeywords) {
    if (requiredKeywords.length >= 5) break
    const trimmed = kw.trim()
    if (!trimmed) continue

    // Try lexicon alias lookup first
    const variant = keywordVariantIn(haystack, trimmed)
    if (variant !== null) {
      // variant is already an alias string (lowercased regex-safe form)
      if (!seen.has(variant)) {
        seen.add(variant)
        requiredKeywords.push(variant)
      }
      continue
    }

    // Term not in lexicon (or no alias matched): fall back to literal presence
    const lower = trimmed.toLowerCase()
    if (haystack.includes(lower) && !seen.has(lower)) {
      seen.add(lower)
      requiredKeywords.push(lower)
    }
    // If neither the lexicon variant nor the literal form is present, drop the term.
  }

  // Unique 4-digit years from work entries
  const yearSet = new Set<string>()
  for (const w of model.work) {
    const sy = extractYear(w.start)
    const ey = extractYear(w.end)
    if (sy) yearSet.add(sy)
    if (ey) yearSet.add(ey)
  }
  const requiredYears = Array.from(yearSet)

  return {
    required_strings: requiredStrings,
    ordered_headings: ['Experience', 'Skills', 'Education'],
    required_keywords: requiredKeywords,
    required_years: requiredYears,
    max_pages: 2,
  }
}
