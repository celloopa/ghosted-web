// CV builder: interview structure, two bounded LLM prompts, lenient parse/validate,
// and the bidirectional JSON-Resume ↔ human-view mapping.
//
// Discipline mirrors generate.ts: code builds the prompt, code parses, code validates.
// The model may only emit what the resume text or interview answers actually contain.

import { validateCVJson, type CVSummary } from './baseline'

// ---------------------------------------------------------------------------
// Interview question structure
// ---------------------------------------------------------------------------

export type FieldKind = 'text' | 'textarea' | 'list'

export interface InterviewField {
  id: string
  label: string
  kind: FieldKind
  placeholder?: string
  help?: string
}

export interface InterviewSection {
  id: string
  title: string
  help?: string
  /** When true, the UI should allow multiple instances of this section (e.g. work, education) */
  repeatable?: true
  fields: InterviewField[]
}

export const INTERVIEW_QUESTIONS: InterviewSection[] = [
  {
    id: 'basics',
    title: 'About you',
    help: 'Basic contact information so employers can reach you.',
    fields: [
      { id: 'name', label: 'Full name', kind: 'text', placeholder: 'Jane Smith' },
      { id: 'email', label: 'Email address', kind: 'text', placeholder: 'jane@example.com' },
      { id: 'phone', label: 'Phone number', kind: 'text', placeholder: '+1 555 000 0000' },
      { id: 'location', label: 'City & state / country', kind: 'text', placeholder: 'Asheville, NC' },
      {
        id: 'links',
        label: 'Links (LinkedIn, GitHub, portfolio, etc.)',
        kind: 'list',
        placeholder: 'https://github.com/yourhandle',
        help: 'One per line — paste the full URL.',
      },
    ],
  },
  {
    id: 'summary',
    title: 'Professional summary',
    help: 'Optional — one or two sentences describing who you are professionally.',
    fields: [
      {
        id: 'summary',
        label: 'Summary (optional)',
        kind: 'textarea',
        placeholder: 'I design and build products at the intersection of engineering and user experience.',
        help: 'Leave blank if you prefer to skip this.',
      },
    ],
  },
  {
    id: 'work',
    title: 'Work experience',
    help: 'Add each job separately. Hit "Add another role" to keep going.',
    repeatable: true,
    fields: [
      { id: 'company', label: 'Company or organisation', kind: 'text', placeholder: 'Acme Corp' },
      { id: 'title', label: 'Your job title', kind: 'text', placeholder: 'Senior Engineer' },
      { id: 'start', label: 'Start date', kind: 'text', placeholder: '2020-03 or March 2020' },
      {
        id: 'end',
        label: 'End date (or "present")',
        kind: 'text',
        placeholder: 'present',
        help: 'Type "present" if this is your current role.',
      },
      {
        id: 'whatDidYouDo',
        label: 'What did you do there?',
        kind: 'textarea',
        placeholder: 'Built the onboarding flow in React, cutting drop-off by 30%. Led a team of 3 engineers. Owned the payments integration with Stripe.',
        help: 'Be specific — include tools, outcomes, and team size if you remember them. We will turn this into bullet points.',
      },
    ],
  },
  {
    id: 'skills',
    title: 'Skills',
    help: 'List the tools, languages, frameworks, and practices you are comfortable with.',
    fields: [
      {
        id: 'skills',
        label: 'Skills',
        kind: 'list',
        placeholder: 'TypeScript\nReact\nFigma\nGo',
        help: 'One per line, or comma-separated.',
      },
    ],
  },
  {
    id: 'education',
    title: 'Education',
    help: 'Include degrees, bootcamps, certifications — whatever is relevant.',
    repeatable: true,
    fields: [
      { id: 'school', label: 'School or programme', kind: 'text', placeholder: 'University of North Carolina Asheville' },
      { id: 'focus', label: 'Subject / major (optional)', kind: 'text', placeholder: 'Computer Science' },
      { id: 'years', label: 'Years attended or graduation year', kind: 'text', placeholder: '2017–2021 or 2021' },
    ],
  },
  {
    id: 'projects',
    title: 'Projects',
    help: 'Optional — side projects, open source, freelance work.',
    repeatable: true,
    fields: [
      { id: 'name', label: 'Project name', kind: 'text', placeholder: 'ghosted' },
      {
        id: 'description',
        label: 'What is it?',
        kind: 'textarea',
        placeholder: 'A terminal-based job tracker built with Go and Bubble Tea.',
      },
      { id: 'url', label: 'URL (optional)', kind: 'text', placeholder: 'https://github.com/you/project' },
    ],
  },
]

// ---------------------------------------------------------------------------
// JSON Resume shape (embedded in prompts for clarity)
// ---------------------------------------------------------------------------

const JSON_RESUME_SHAPE = `{
  "basics": {
    "name": "string",
    "label": "string (headline/title)",
    "email": "string",
    "phone": "string",
    "location": { "city": "string", "region": "string", "countryCode": "string" },
    "summary": "string",
    "profiles": [{ "network": "string", "url": "string" }]
  },
  "work": [{
    "name": "string (company)",
    "position": "string (job title)",
    "startDate": "string (YYYY-MM or as written)",
    "endDate": "string (YYYY-MM, as written, or empty string for current)",
    "highlights": ["string (concise resume bullet)"]
  }],
  "education": [{
    "institution": "string",
    "area": "string (major/subject)",
    "studyType": "string (BS, BA, bootcamp, etc.)",
    "endDate": "string (graduation year or range)"
  }],
  "skills": [{ "name": "string" }],
  "projects": [{
    "name": "string",
    "description": "string",
    "url": "string",
    "highlights": ["string"]
  }]
}`

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

// ---------------------------------------------------------------------------
// buildCVExtractPrompt
// ---------------------------------------------------------------------------

/**
 * Build the bounded prompt to convert resume text → JSON Resume.
 * Rules: extract ONLY what is present; never invent; keep dates as written.
 * When existingCvJson is given, merge new evidence in, preferring existing non-empty values.
 */
export function buildCVExtractPrompt(resumeText: string, opts?: { existingCvJson?: string }): string {
  const mergeBlock = opts?.existingCvJson
    ? `\nYou are merging into an existing JSON Resume. Prefer existing non-empty values; add only new evidence from the resume text below. Do not remove existing work, skills, or education unless the resume text explicitly contradicts them.\n\nExisting JSON Resume:\n${clip(opts.existingCvJson, 8000)}\n`
    : ''

  return `Convert the following resume text into a JSON Resume object.

Extract ONLY what is present in the text — never invent roles, dates, employers, metrics, skills, or contact info. Keep dates exactly as written. If a field is absent, omit it rather than guessing.
${mergeBlock}
JSON Resume shape to emit:
${JSON_RESUME_SHAPE}

Resume text:
${clip(resumeText, 12000)}

Respond with ONLY the JSON Resume object. No prose, no code fences, no markdown — the raw JSON object only.`
}

// ---------------------------------------------------------------------------
// buildCVInterviewPrompt
// ---------------------------------------------------------------------------

/**
 * Build the bounded prompt to assemble a JSON Resume from guided-interview answers.
 * Rules: turn each "what did you do there?" freeform into 2–4 concise, truthful bullets
 * using ONLY facts the person stated; never invent metrics, tools, or dates not in the answers.
 */
export function buildCVInterviewPrompt(answers: unknown): string {
  const answersJson = clip(JSON.stringify(answers, null, 2), 12000)

  return `You are assembling a JSON Resume from a candidate's answers to a guided job-application interview.

Interview answers (JSON):
${answersJson}

Instructions:
- For each work entry, turn the "whatDidYouDo" freeform text into 2–4 concise resume bullet points for the highlights array.
  Use ONLY facts the person explicitly stated — tools, outcomes, team sizes, dates. Never invent metrics, tool names, or accomplishments not present in the answers.
- For skills, use the list the person provided verbatim — do not add, remove, or reorder.
- Keep all dates exactly as written by the candidate.
- If a field was left blank or not provided, omit it from the output.
- Do not add a summary unless the candidate provided one.
- Never invent roles, dates, employers, metrics, tools, case studies, contacts, or any fact not present in the answers above.

JSON Resume shape to emit:
${JSON_RESUME_SHAPE}

Respond with ONLY the JSON Resume object. No prose, no code fences, no markdown — the raw JSON object only.`
}

// ---------------------------------------------------------------------------
// parseCVResult
// ---------------------------------------------------------------------------

export type CVParseResult =
  | { ok: true; cvJson: string; summary: CVSummary }
  | { ok: false; error: string }

/**
 * Lenient parse: strip prose/fences, extract first JSON object, run validateCVJson.
 * Never throws.
 */
export function parseCVResult(raw: string): CVParseResult {
  // Find first { … last } (tolerates fenced code blocks and prose wrapping)
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return { ok: false, error: 'no JSON object found in model response' }
  }
  const candidate = raw.slice(start, end + 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch (e) {
    return { ok: false, error: `response contained invalid JSON: ${(e as Error).message}` }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'response was not a JSON object' }
  }
  const validation = validateCVJson(candidate)
  if (!validation.ok) {
    return { ok: false, error: validation.errors.map((e) => e.message).join('; ') }
  }
  return { ok: true, cvJson: JSON.stringify(parsed), summary: validation.summary }
}

// ---------------------------------------------------------------------------
// CVView — the human-friendly bidirectional mapping
// ---------------------------------------------------------------------------

export interface CVView {
  name: string
  headline?: string
  summary?: string
  contact: {
    email?: string
    phone?: string
    location?: string
    links: { label: string; url: string }[]
  }
  work: {
    company: string
    title?: string
    start?: string
    end?: string
    highlights: string[]
  }[]
  projects: {
    name: string
    description?: string
    url?: string
    highlights: string[]
  }[]
  skills: string[]
  education: {
    institution: string
    area?: string
    studyType?: string
    year?: string
  }[]
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/**
 * Parse a JSON Resume string into a CVView.
 * Returns null if the string is unparseable or basics.name is missing.
 * Tolerates every missing section — uses empty arrays as defaults.
 */
export function cvToView(cvJson: string): CVView | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(cvJson)
  } catch {
    return null
  }
  const cv = asRecord(parsed)
  if (!cv) return null

  const basics = asRecord(cv.basics) ?? {}
  const name = asString(basics.name)
  if (!name) return null

  // Location: prefer "City, Region" constructed from object; fall back to string
  let location: string | undefined
  const loc = asRecord(basics.location)
  if (loc) {
    const parts = [asString(loc.city), asString(loc.region)].filter(Boolean)
    if (parts.length > 0) location = parts.join(', ')
  }
  if (!location) location = asString(basics.location as unknown)

  // Profiles → links
  const links: { label: string; url: string }[] = []
  for (const p of asArray(basics.profiles)) {
    const profile = asRecord(p)
    if (!profile) continue
    const url = asString(profile.url)
    if (!url) continue
    let label: string
    try {
      label = asString(profile.network) ?? new URL(url).hostname
    } catch {
      label = url
    }
    links.push({ label, url })
  }

  // Work
  const work: CVView['work'] = []
  for (const w of asArray(cv.work)) {
    const entry = asRecord(w)
    if (!entry) continue
    const company = asString(entry.name)
    if (!company) continue
    work.push({
      company,
      title: asString(entry.position),
      start: asString(entry.startDate),
      end: asString(entry.endDate),
      highlights: asArray(entry.highlights)
        .map((h) => asString(h))
        .filter((h): h is string => h !== undefined),
    })
  }

  // Projects
  const projects: CVView['projects'] = []
  for (const p of asArray(cv.projects)) {
    const entry = asRecord(p)
    if (!entry) continue
    const pName = asString(entry.name)
    if (!pName) continue
    projects.push({
      name: pName,
      description: asString(entry.description),
      url: asString(entry.url),
      highlights: asArray(entry.highlights)
        .map((h) => asString(h))
        .filter((h): h is string => h !== undefined),
    })
  }

  // Skills: [{name}] → string[]
  const skills: string[] = []
  for (const s of asArray(cv.skills)) {
    const entry = asRecord(s)
    if (entry) {
      const n = asString(entry.name)
      if (n) skills.push(n)
    } else {
      const n = asString(s)
      if (n) skills.push(n)
    }
  }

  // Education
  const education: CVView['education'] = []
  for (const e of asArray(cv.education)) {
    const entry = asRecord(e)
    if (!entry) continue
    const institution = asString(entry.institution)
    if (!institution) continue
    education.push({
      institution,
      area: asString(entry.area),
      studyType: asString(entry.studyType),
      year: asString(entry.endDate),
    })
  }

  return {
    name,
    headline: asString(basics.label),
    summary: asString(basics.summary),
    contact: {
      email: asString(basics.email),
      phone: asString(basics.phone),
      location,
      links,
    },
    work,
    projects,
    skills,
    education,
  }
}

/**
 * Serialize a CVView back to a JSON Resume string.
 * The UI edits the view; this persists it as valid JSON Resume.
 *
 * Normalization decisions:
 * - contact.links → basics.profiles with network = label, url = url
 * - skills string[] → [{name}]
 * - location "City, Region" string → {city, region} (best-effort split on last comma)
 * - work.end of "present" maps to endDate: "" (JSON Resume convention for current role)
 */
export function viewToCvJson(view: CVView): string {
  // Location string → {city, region}
  let locationObj: { city?: string; region?: string } | undefined
  if (view.contact.location) {
    const idx = view.contact.location.lastIndexOf(',')
    if (idx >= 0) {
      locationObj = {
        city: view.contact.location.slice(0, idx).trim(),
        region: view.contact.location.slice(idx + 1).trim(),
      }
    } else {
      locationObj = { city: view.contact.location.trim() }
    }
  }

  const basics: Record<string, unknown> = { name: view.name }
  if (view.headline) basics.label = view.headline
  if (view.contact.email) basics.email = view.contact.email
  if (view.contact.phone) basics.phone = view.contact.phone
  if (locationObj) basics.location = locationObj
  if (view.summary) basics.summary = view.summary
  if (view.contact.links.length > 0) {
    basics.profiles = view.contact.links.map((l) => ({ network: l.label, url: l.url }))
  }

  const cv: Record<string, unknown> = { basics }

  if (view.work.length > 0) {
    cv.work = view.work.map((w) => {
      const entry: Record<string, unknown> = { name: w.company }
      if (w.title) entry.position = w.title
      if (w.start) entry.startDate = w.start
      // "present" → empty string (JSON Resume convention)
      if (w.end !== undefined) entry.endDate = w.end === 'present' ? '' : w.end
      if (w.highlights.length > 0) entry.highlights = w.highlights
      return entry
    })
  }

  if (view.education.length > 0) {
    cv.education = view.education.map((e) => {
      const entry: Record<string, unknown> = { institution: e.institution }
      if (e.area) entry.area = e.area
      if (e.studyType) entry.studyType = e.studyType
      if (e.year) entry.endDate = e.year
      return entry
    })
  }

  if (view.skills.length > 0) {
    cv.skills = view.skills.map((s) => ({ name: s }))
  }

  if (view.projects.length > 0) {
    cv.projects = view.projects.map((p) => {
      const entry: Record<string, unknown> = { name: p.name }
      if (p.description) entry.description = p.description
      if (p.url) entry.url = p.url
      if (p.highlights.length > 0) entry.highlights = p.highlights
      return entry
    })
  }

  return JSON.stringify(cv)
}
