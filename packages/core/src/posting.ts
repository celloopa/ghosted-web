import { deriveSource } from './stats'

// Deterministic posting parser — minimum viable intelligence means no model
// call for facts a job board already publishes. Schema.org JobPosting
// JSON-LD first (Greenhouse, Lever, Ashby all embed it), heuristics second,
// plain pasted text as the always-works fallback.

const MAX_DESCRIPTION = 20000

export interface PostingFacts {
  company?: string
  position?: string
  location?: string
  remote?: boolean
  salary_min?: number
  salary_max?: number
  source?: string
  /** Plain readable text of the posting, capped. */
  description: string
}

export function parsePostingHTML(html: string, url?: string): PostingFacts {
  const facts: PostingFacts = { description: '' }

  const ld = findJobPostingLD(html)
  if (ld) {
    const title = str(ld.title)
    if (title) facts.position = decodeEntities(stripTags(title)).trim()
    const org = ld.hiringOrganization as Record<string, unknown> | undefined
    const orgName = org && str(org.name)
    if (orgName) facts.company = orgName.trim()

    const loc = firstLocation(ld.jobLocation)
    if (loc) facts.location = loc
    if (str(ld.jobLocationType)?.toUpperCase().includes('TELECOMMUTE')) facts.remote = true

    const salary = extractLDSalary(ld.baseSalary)
    if (salary) {
      facts.salary_min = salary.min
      facts.salary_max = salary.max
    }
  }

  const text = htmlToText(html)
  const ldDescription = ld && str(ld.description) ? htmlToText(str(ld.description)!) : ''
  // Real pages usually render the JSON-LD description in the body; when the
  // page text doesn't contain it (JS-shell pages), keep both.
  let description = text
  if (ldDescription) {
    const probe = ldDescription.slice(0, 60)
    if (!text.includes(probe)) description = ldDescription.length > text.length ? ldDescription : `${text}\n\n${ldDescription}`
  }
  facts.description = description.slice(0, MAX_DESCRIPTION)

  // Heuristic fallbacks for whatever JSON-LD didn't cover.
  if (!facts.position || !facts.company) {
    const fromTitle = parseTitleTag(html)
    facts.position = facts.position ?? fromTitle.position
    facts.company = facts.company ?? fromTitle.company
  }
  if (facts.remote === undefined && /\bremote\b/i.test(facts.description)) facts.remote = true
  if (facts.salary_min === undefined) {
    const range = findSalaryRange(facts.description)
    if (range) {
      facts.salary_min = range.min
      facts.salary_max = range.max
    }
  }
  if (url) {
    const source = deriveSource(url)
    if (source) facts.source = source
  }
  return facts
}

// ---- JSON-LD ----

function findJobPostingLD(html: string): Record<string, unknown> | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1]!.trim())
    } catch {
      continue
    }
    const found = digForJobPosting(parsed)
    if (found) return found
  }
  return null
}

function digForJobPosting(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = digForJobPosting(item)
      if (found) return found
    }
    return null
  }
  if (typeof node !== 'object' || node === null) return null
  const rec = node as Record<string, unknown>
  const type = rec['@type']
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return rec
  if (rec['@graph']) return digForJobPosting(rec['@graph'])
  return null
}

function firstLocation(jobLocation: unknown): string | undefined {
  const loc = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation
  if (typeof loc !== 'object' || loc === null) return undefined
  const address = (loc as Record<string, unknown>).address
  if (typeof address !== 'object' || address === null) return undefined
  const a = address as Record<string, unknown>
  const parts = [str(a.addressLocality), str(a.addressRegion)].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
}

function extractLDSalary(baseSalary: unknown): { min?: number; max?: number } | null {
  if (typeof baseSalary !== 'object' || baseSalary === null) return null
  const value = (baseSalary as Record<string, unknown>).value
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const min = num(v.minValue) ?? num(v.value)
  const max = num(v.maxValue) ?? num(v.value)
  if (min === undefined && max === undefined) return null
  const out: { min?: number; max?: number } = {}
  if (min !== undefined) out.min = Math.round(min)
  if (max !== undefined) out.max = Math.round(max)
  return out
}

// ---- heuristics ----

function parseTitleTag(html: string): { position?: string; company?: string } {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!m) return {}
  const title = decodeEntities(m[1]!).trim()
  // "Design Engineer - Figma | Careers" → split on the strongest separators
  const parts = title
    .split(/\s*[|·]\s*/)[0]!
    .split(/\s+[-–—]\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: { position?: string; company?: string } = {}
  if (parts.length >= 1 && parts[0]) out.position = parts[0]
  if (parts.length >= 2 && parts[1] && !/careers?|jobs?/i.test(parts[1]!)) out.company = parts[1]
  return out
}

const SALARY_RANGE =
  /\$\s?(\d{2,3}(?:[,.]\d{3})?|\d{2,3})\s*(k)?\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3}(?:[,.]\d{3})?|\d{2,3})\s*(k)?/i

function findSalaryRange(text: string): { min: number; max: number } | null {
  const m = SALARY_RANGE.exec(text)
  if (!m) return null
  const parse = (raw: string, k?: string) => {
    const n = Number(raw.replace(/[,.]/g, ''))
    return k ? n * 1000 : n
  }
  const min = parse(m[1]!, m[2])
  const max = parse(m[3]!, m[4])
  // Yearly sanity window — ignore "$5 - $10" type matches.
  if (min < 20000 || max > 2_000_000 || max < min) return null
  return { min, max }
}

// ---- html → text ----

const BLOCK_TAGS = /<\/?(?:p|div|li|ul|ol|h[1-6]|br|tr|section|article)[^>]*>/gi

export function htmlToText(html: string): string {
  let s = html
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  s = s.replace(/<head[\s\S]*?<\/head>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(BLOCK_TAGS, '\n')
  s = s.replace(/<[^>]+>/g, ' ')
  s = decodeEntities(s)
  s = s.replace(/[ \t]+/g, ' ')
  s = s.replace(/\s*\n\s*/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
}
