// typstExport.ts — Node.js-only. Produces .typ documents and orchestrates
// typst compilation + ATS validation via shell tools.
// ATS-safe rules mirrored from apps/web/templates/resume-template.typ:
//   - single column (no tables/grids), standard heading order
//   - ligatures: false, hyphenate: false
//   - headings: "Experience", "Skills", "Education" in that order

import { execFile as _execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { ResumeModel, AtsExpectations, DocStyle } from '@ghosted/core'
import { typstEscape, buildExpectations } from '@ghosted/core'

const execFile = promisify(_execFile)

// ─────────────────────────────────────────────────────────────────────────────
// Environment helpers
// ─────────────────────────────────────────────────────────────────────────────

function hardenedEnv(): NodeJS.ProcessEnv {
  const home = homedir()
  const extraPaths = [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'].join(':')
  return {
    ...process.env,
    PATH: `${process.env.PATH ?? ''}:${extraPaths}`,
    // Ensure typst can locate its package cache (HOME may be missing in some server envs)
    HOME: process.env.HOME ?? home,
  }
}

const TYPST_BIN = process.env.GHOSTED_TYPST_BIN ?? 'typst'
const PYTHON3_BIN = process.env.GHOSTED_PYTHON3_BIN ?? 'python3'
// CWD of the web app at runtime (Next.js sets this to the project root)
const WEB_CWD = process.cwd()

// ─────────────────────────────────────────────────────────────────────────────
// Typst document generators
// ─────────────────────────────────────────────────────────────────────────────

/** Full content-mode escape (for use inside Typst content brackets [...]) */
function e(s: string): string {
  return typstEscape(s)
}

/**
 * String-literal escape for Typst dict values passed to the modern-cv author block.
 * Inside a Typst string literal "...", only backslash and double-quote need escaping.
 * @ is safe in string context — typstEscape's \@ would become a literal backslash-at
 * which breaks mailto links in the modern-cv template.
 */
function eStr(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

/** Format a start/end year pair for display. endDate empty string → "Present". */
function fmtDates(start?: string, end?: string): string {
  const s = start ? start.slice(0, 4) : ''
  const en = !end || end.trim() === '' ? 'Present' : end.slice(0, 4)
  return s ? `${s} – ${en}` : en
}

// ─────────────────────────────────────────────────────────────────────────────
// Modern-CV template generator (@preview/modern-cv:0.9.0)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The result of a resume generator call.
 * `typ` is the full Typst source.
 * `plainText` is the concatenation of every human-readable string that the
 * generator actually emits into the document (same set used for ATS haystack).
 * It is assembled directly from the values pushed into the rendered output so
 * that buildExpectations sees exactly what the PDF will contain — no model
 * fields that go un-rendered (e.g. skill sub-keywords, projects section, etc.).
 */
export interface ResumeTypResult {
  typ: string
  plainText: string
}

/**
 * Build a modern-cv resume document mirroring the originals exactly.
 * The package's knobs (from lib.typ source):
 *   accent-color: color (accepts string → rgb() internally in 0.9.0)
 *   font: array of font families (default: "Source Sans Pro", "Source Sans 3")
 *   header-font: string (default: "Roboto")
 *   colored-headers: bool
 *   show-footer: bool
 *   show-address-icon: bool
 *   paper-size: string
 *
 * Style injection:
 *   accentColor → accent-color param (0.9.0 accepts hex strings directly)
 *   font → font param as first family with package default as fallback,
 *          PLUS a post-show #set text() override so body text uses the choice.
 */
function generateModernResumeTyp(model: ResumeModel, style: DocStyle): ResumeTypResult {
  const lines: string[] = []
  const m = model.modern

  // Use eStr (string-literal escape) for all author dict values: @ is safe in Typst
  // string context but typstEscape's \@ would break mailto links in modern-cv.
  const firstname = m ? eStr(m.firstname) : eStr(model.name.split(' ').slice(0, -1).join(' ') || model.name)
  const lastname = m ? eStr(m.lastname) : eStr(model.name.split(' ').slice(-1)[0] ?? model.name)

  // plainText accumulates every human-readable string the template renders as
  // VISIBLE PAGE CONTENT — metadata params are invisible to pdftotext extraction.
  // Rule: only push to plain[] when the value reaches a rendered content node
  // (resume-item bullets, resume-entry title/description, header fields).
  // EXCLUDED from plain[]: resume.with(description:) — this is document metadata
  // (PDF Description field), never rendered as a visible paragraph on the page.
  const plain: string[] = []

  lines.push('#import "@preview/modern-cv:0.9.0": *')
  lines.push('')
  lines.push('#show: resume.with(')
  lines.push('  author: (')
  lines.push(`    firstname: "${firstname}",`)
  lines.push(`    lastname: "${lastname}",`)
  plain.push(model.name)
  lines.push(`    email: "${eStr(model.email)}",`)
  plain.push(model.email)
  if (m?.homepage) lines.push(`    homepage: "${eStr(m.homepage)}",`)
  if (model.phone) { lines.push(`    phone: "${eStr(model.phone)}",`); plain.push(model.phone) }
  if (m?.github) lines.push(`    github: "${eStr(m.github)}",`)
  if (m?.linkedin) lines.push(`    linkedin: "${eStr(m.linkedin)}",`)
  if (model.location) { lines.push(`    address: "${eStr(model.location)}",`); plain.push(model.location) }
  if (m?.positions && m.positions.length > 0) {
    lines.push('    positions: (')
    for (const pos of m.positions) {
      lines.push(`      "${eStr(pos)}",`)
      plain.push(pos)
    }
    lines.push('    ),')
  }
  lines.push('  ),')
  if (model.summary) {
    // description: maps to PDF document metadata — NOT a visible rendered paragraph.
    // Keep it in the .typ for faithful reproduction of the original template, but
    // do NOT include it in plain[] (pdftotext will not find it on the page).
    lines.push(`  description: "${eStr(model.summary)}",`)
  }
  lines.push('  profile-picture: none,')
  lines.push(`  date: datetime.today().display(),`)
  lines.push('  language: "en",')
  lines.push('  colored-headers: true,')
  lines.push('  show-footer: false,')
  lines.push('  show-address-icon: true,')
  lines.push('  paper-size: "us-letter",')
  // accent-color: 0.9.0 accepts a hex string and converts it internally via rgb()
  if (style.accentColor) {
    lines.push(`  accent-color: "${style.accentColor}",`)
  }
  // font: inject user choice as primary, keep package defaults as fallback
  if (style.font) {
    lines.push(`  font: ("${eStr(style.font)}", "Source Sans Pro", "Source Sans 3"),`)
  }
  lines.push(')')
  lines.push('')

  // ── EXPERIENCE ──
  lines.push('= Experience')
  lines.push('')
  for (const w of model.work) {
    if (w.highlights.length === 0) continue
    const dates = fmtDates(w.start, w.end)
    // resume-entry args are Typst string literals — use eStr (@ safe in strings)
    lines.push('#resume-entry(')
    lines.push(`  title: "${eStr(w.position ?? w.name)}",`)
    plain.push(w.position ?? w.name)
    lines.push(`  location: "",`)
    lines.push(`  date: "${eStr(dates)}",`)
    plain.push(dates)
    lines.push(`  description: "${eStr(w.name)}",`)
    plain.push(w.name)
    lines.push(')')
    lines.push('')
    // resume-item content is in [...] (content mode) — use e() for full escaping
    lines.push('#resume-item[')
    for (const h of w.highlights) {
      lines.push(`  - ${e(h)}`)
      plain.push(h)
    }
    lines.push(']')
    lines.push('')
  }

  // ── SKILLS ──
  lines.push('= Skills')
  lines.push('')
  if (model.skills.length > 0) {
    // resume-skill-item args are string literals — use eStr
    const skillItems = model.skills.map((s) => `"${eStr(s)}"`).join(', ')
    lines.push(`#resume-skill-item("Skills", (${skillItems}))`)
    plain.push(...model.skills)
  }
  lines.push('')

  // ── EDUCATION ──
  lines.push('= Education')
  lines.push('')
  for (const edu of model.education) {
    const yearPart = edu.year ? ` (${edu.year})` : ''
    const area = edu.area ? `${eStr(edu.area)}${yearPart}` : yearPart
    lines.push('#resume-entry(')
    lines.push(`  title: "${eStr(edu.institution)}",`)
    plain.push(edu.institution)
    lines.push(`  location: "",`)
    lines.push(`  date: "${yearPart.replace(/[()]/g, '').trim()}",`)
    lines.push(`  description: "${area}",`)
    if (edu.area) plain.push(edu.area)
    lines.push(')')
    lines.push('')
  }

  return { typ: lines.join('\n'), plainText: plain.join(' ') }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain-ATS template generator (original hand-rolled)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce a complete Typst resume document from a ResumeModel.
 * Preserves all ATS-safe properties from the vendored template:
 *   - single column layout (no table/grid)
 *   - ligatures: false
 *   - hyphenate: false
 *   - headings "Experience", "Skills", "Education" in that exact order
 */
function generatePlainResumeTyp(model: ResumeModel, style: DocStyle): ResumeTypResult {
  const lines: string[] = []
  // plainText accumulates every human-readable string the template renders.
  const plain: string[] = []

  // Page and text settings — must match the vendored template's ATS-safe settings
  // Slightly tighter margins + smaller font to keep the full CV within 2 pages.
  const fontFamily = style.font ? `"${e(style.font)}", "Libertinus Serif"` : '"Libertinus Serif"'
  lines.push('#set page(paper: "us-letter", margin: (x: 0.65in, y: 0.55in))')
  lines.push(`#set text(font: (${fontFamily}), size: 9.5pt, ligatures: false, hyphenate: false)`)
  lines.push('#set par(justify: false, leading: 0.45em)')
  lines.push('')

  // Section helper (same as vendored template)
  lines.push('#let section(heading) = {')
  lines.push('  v(4pt)')
  lines.push('  text(size: 11pt, weight: "bold")[#heading]')
  lines.push('  line(length: 100%, stroke: 0.5pt)')
  lines.push('  v(1pt)')
  lines.push('}')
  lines.push('')

  // Role helper (same as vendored template)
  lines.push('#let role(company, position, dates, loc, bullets) = {')
  lines.push('  text(weight: "bold")[#company] + text[ — #position]')
  lines.push('  linebreak()')
  lines.push('  text(size: 8.5pt, style: "italic")[#dates · #loc]')
  lines.push('  for b in bullets [')
  lines.push('    - #b')
  lines.push('  ]')
  lines.push('  v(2pt)')
  lines.push('}')
  lines.push('')

  // Header — name, optional phone/location, email, links
  lines.push('#align(center)[')
  lines.push(`  #text(size: 18pt, weight: "bold")["${e(model.name)}"] \\`)
  plain.push(model.name)
  if (model.location) {
    const contactLine = [model.location, model.email, model.phone].filter(Boolean).join(' · ')
    lines.push(`  #text(size: 9.5pt)["${e(contactLine)}"] \\`)
    plain.push(contactLine)
  } else {
    const contactLine = [model.email, model.phone].filter(Boolean).join(' · ')
    lines.push(`  #text(size: 9.5pt)["${e(contactLine)}"] \\`)
    plain.push(contactLine)
  }
  if (model.links.length > 0) {
    const linkLine = model.links.map((l) => l.label).join(' · ')
    lines.push(`  #text(size: 9.5pt)["${e(linkLine)}"]`)
    plain.push(linkLine)
  }
  lines.push(']')
  lines.push('#v(2pt)')

  // Summary
  if (model.summary) {
    lines.push(`"${e(model.summary)}"`)
    lines.push('#v(3pt)')
    plain.push(model.summary)
  }
  lines.push('')

  // ── EXPERIENCE ──
  lines.push('#section("Experience")')
  for (const w of model.work) {
    if (w.highlights.length === 0) continue
    const dates = fmtDates(w.start, w.end)
    const loc = '' // location not in ResumeModel per-work — omit gracefully
    const bulletArray = w.highlights.map((h) => `"${e(h)}"`).join(',\n    ')
    lines.push(`#role(`)
    lines.push(`  "${e(w.name)}",`)
    plain.push(w.name)
    lines.push(`  "${e(w.position ?? '')}",`)
    if (w.position) plain.push(w.position)
    lines.push(`  "${e(dates)}",`)
    plain.push(dates)
    lines.push(`  "${e(loc)}",`)
    lines.push(`  (`)
    lines.push(`    ${bulletArray},`)
    lines.push(`  ),`)
    lines.push(`)`)
    for (const h of w.highlights) plain.push(h)
  }
  lines.push('')

  // ── SKILLS ──
  lines.push('#section("Skills")')
  if (model.skills.length > 0) {
    lines.push(model.skills.map((s) => e(s)).join(', '))
    plain.push(...model.skills)
  }
  lines.push('')

  // ── EDUCATION ──
  lines.push('#section("Education")')
  for (const edu of model.education) {
    const yearPart = edu.year ? ` (${edu.year})` : ''
    const areaPart = edu.area ? ` — ${edu.area}${yearPart}` : yearPart
    lines.push(`#text(weight: "bold")["${e(edu.institution)}"]`)
    plain.push(edu.institution)
    if (areaPart) {
      lines.push(`"${e(areaPart)}"`)
      if (edu.area) plain.push(edu.area)
    }
    lines.push('#v(3pt)')
  }

  return { typ: lines.join('\n'), plainText: plain.join(' ') }
}

/**
 * Produce a complete Typst resume document from a ResumeModel.
 * Routes to the modern-cv or plain-ATS template based on style.template.
 * Returns { typ, plainText } where plainText is assembled from exactly the
 * strings rendered by the template — use it as the ATS haystack so that
 * buildExpectations never asserts a keyword that the PDF won't contain.
 */
export function generateResumeTyp(model: ResumeModel, style: DocStyle = { template: 'modern' }): ResumeTypResult {
  if (style.template === 'modern') return generateModernResumeTyp(model, style)
  return generatePlainResumeTyp(model, style)
}

export interface CoverLetterInput {
  name: string
  email: string
  company: string
  position: string
  /** Pre-written body. May contain multiple paragraphs separated by \n\n. Already includes sign-off. */
  body: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Cover letter generators
// ─────────────────────────────────────────────────────────────────────────────

function generateModernCoverLetterTyp(input: CoverLetterInput, style: DocStyle): string {
  const lines: string[] = []
  const nameParts = input.name.split(' ')
  const lastname = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : input.name
  const firstname = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''

  lines.push('#import "@preview/modern-cv:0.9.0": *')
  lines.push('')
  lines.push('#show: coverletter.with(')
  lines.push('  author: (')
  lines.push(`    firstname: "${eStr(firstname)}",`)
  lines.push(`    lastname: "${eStr(lastname)}",`)
  lines.push(`    email: "${eStr(input.email)}",`)
  // positions is required by lib.typ line 727 — supply empty tuple rather than omitting
  lines.push('    positions: (),')
  lines.push('  ),')
  lines.push('  profile-picture: none,')
  lines.push('  language: "en",')
  if (style.accentColor) {
    lines.push(`  accent-color: "${style.accentColor}",`)
  }
  if (style.font) {
    lines.push(`  font: ("${eStr(style.font)}", "Source Sans Pro", "Source Sans 3"),`)
  }
  lines.push('  show-footer: false,')
  lines.push(')')
  lines.push('')

  lines.push('#hiring-entity-info(')
  lines.push('  entity-info: (')
  lines.push(`    target: "Hiring Team",`)
  lines.push(`    name: "${eStr(input.company)}",`)
  lines.push('    street-address: "",')
  lines.push('    city: "",')
  lines.push('  ),')
  lines.push(')')
  lines.push('')
  lines.push(`#letter-heading(job-position: "${eStr(input.position)}", addressee: "Hiring Team")`)
  lines.push('')

  const paragraphs = input.body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  for (const para of paragraphs) {
    lines.push('#coverletter-content[')
    lines.push(`  ${e(para)}`)
    lines.push(']')
    lines.push('')
  }

  return lines.join('\n')
}

function generatePlainCoverLetterTyp(input: CoverLetterInput, style: DocStyle): string {
  const lines: string[] = []
  const fontFamily = style.font ? `"${e(style.font)}", "Libertinus Serif"` : '"Libertinus Serif"'

  lines.push('#set page(paper: "us-letter", margin: (x: 1in, y: 0.65in))')
  lines.push(`#set text(font: (${fontFamily}), size: 10pt, ligatures: false, hyphenate: false)`)
  lines.push('#set par(justify: false, leading: 0.55em)')
  lines.push('')

  // Contact header (name + email)
  const contact = [input.name, input.email].filter(Boolean).join(' · ')
  lines.push(`#text(weight: "bold")["${e(contact)}"]`)
  lines.push('#v(8pt)')

  // Body: split paragraphs by double newline and render each
  const paragraphs = input.body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  for (const para of paragraphs) {
    lines.push(`#par["${e(para)}"]`)
    lines.push('#v(6pt)')
  }

  return lines.join('\n')
}

/**
 * Produce a Typst cover letter document.
 * Routes to modern-cv or plain-ATS based on style.template.
 * ATS-safe in both modes: no tables, ligatures off (plain), hyphenate off (plain).
 */
export function generateCoverLetterTyp(input: CoverLetterInput, style: DocStyle = { template: 'modern' }): string {
  if (style.template === 'modern') return generateModernCoverLetterTyp(input, style)
  return generatePlainCoverLetterTyp(input, style)
}

// ─────────────────────────────────────────────────────────────────────────────
// runExport
// ─────────────────────────────────────────────────────────────────────────────

export interface RunExportInput {
  appId: string
  resumeModel: ResumeModel
  coverLetter: string
  /**
   * Pre-built expectations — used when the caller has already constructed
   * them (e.g. from the e2e test). When supplied, they are used as-is.
   * Prefer passing matchedKeywords instead so runExport can derive the
   * keyword haystack from the generated plainText.
   */
  expectations?: AtsExpectations
  /** Canonical keyword terms from extractKeywords. When supplied, runExport
   * builds expectations internally using the plainText from the generated
   * .typ so that only keywords actually rendered in the PDF are asserted. */
  matchedKeywords?: string[]
  style?: DocStyle
}

export interface AtsResult {
  pass: boolean
  report: string
}

export interface ExportResult {
  resume: { pdfBase64: string; ats: AtsResult }
  cover: { pdfBase64: string; ats: AtsResult }
}

/**
 * Write source files, compile PDFs via typst, validate via the ATS checker,
 * return base64-encoded PDFs + validator reports.
 *
 * Directory: apps/web/.ghosted-local/exports/<appId>/
 */
export async function runExport(input: RunExportInput): Promise<ExportResult> {
  const exportDir = join(WEB_CWD, '.ghosted-local', 'exports', input.appId)
  await mkdir(exportDir, { recursive: true })

  const resumeTypPath = join(exportDir, 'resume.typ')
  const coverTypPath = join(exportDir, 'cover-letter.typ')
  const expectPath = join(exportDir, 'expectations.json')
  const resumePdfPath = join(exportDir, 'resume.pdf')
  const coverPdfPath = join(exportDir, 'cover-letter.pdf')

  // Path to the ATS validator (relative to web app cwd)
  const validatorPath = resolve(WEB_CWD, 'tools', 'ats', 'validate_ats.py')

  const style: DocStyle = input.style ?? { template: 'modern' }

  // Generate resume .typ — plainText is used to derive the expectations haystack
  // so that only keywords actually rendered in the PDF are asserted.
  const { typ: resumeTyp, plainText } = generateResumeTyp(input.resumeModel, style)

  // Build expectations: prefer pre-built (passed by caller); otherwise derive
  // from matchedKeywords using plainText as the haystack (the fix — template-
  // specific, derived from what was actually rendered).
  const expectations: AtsExpectations =
    input.expectations ??
    buildExpectations(input.resumeModel, input.matchedKeywords ?? [], plainText)

  const coverTyp = generateCoverLetterTyp({
    name: input.resumeModel.name,
    email: input.resumeModel.email,
    company: 'Company', // cover letter body already has the company name
    position: 'Position',
    body: input.coverLetter,
  }, style)

  await Promise.all([
    writeFile(resumeTypPath, resumeTyp, 'utf8'),
    writeFile(coverTypPath, coverTyp, 'utf8'),
    writeFile(expectPath, JSON.stringify(expectations, null, 2), 'utf8'),
  ])

  // Compile both PDFs in parallel
  const env = hardenedEnv()

  await Promise.all([
    execFile(TYPST_BIN, ['compile', resumeTypPath, resumePdfPath], { env }).catch((err) => {
      const e2 = err as Error & { stderr?: string; stdout?: string }
      throw new Error(`typst compile resume failed: ${(e2.stderr ?? e2.message).slice(0, 500)}`)
    }),
    execFile(TYPST_BIN, ['compile', coverTypPath, coverPdfPath], { env }).catch((err) => {
      const e2 = err as Error & { stderr?: string; stdout?: string }
      throw new Error(`typst compile cover failed: ${(e2.stderr ?? e2.message).slice(0, 500)}`)
    }),
  ])

  // Run ATS validation
  const [resumeAts, coverAts] = await Promise.all([
    runAtsValidator([resumePdfPath, '--expect', expectPath], validatorPath, env),
    runAtsValidator([coverPdfPath, '--cover', '--max-words', '195'], validatorPath, env),
  ])

  // Read PDFs
  const [resumePdf, coverPdf] = await Promise.all([
    readFile(resumePdfPath),
    readFile(coverPdfPath),
  ])

  return {
    resume: { pdfBase64: resumePdf.toString('base64'), ats: resumeAts },
    cover: { pdfBase64: coverPdf.toString('base64'), ats: coverAts },
  }
}

async function runAtsValidator(
  args: string[],
  validatorPath: string,
  env: NodeJS.ProcessEnv,
): Promise<AtsResult> {
  try {
    const result = await execFile(PYTHON3_BIN, [validatorPath, ...args], { env })
    return { pass: true, report: result.stdout.trim() }
  } catch (err) {
    const e2 = err as Error & { code?: number; stdout?: string; stderr?: string }
    if (e2.code === 1) {
      // Exit 1 = validation failure — not a hard error
      return { pass: false, report: (e2.stdout ?? '').trim() }
    }
    // Exit 2 = usage / extraction error — hard failure
    const detail = (e2.stderr ?? e2.message ?? '').slice(0, 500)
    throw new Error(`ATS validator error (exit ${e2.code ?? '?'}): ${detail}`)
  }
}

/** Clean up export artifacts (call after reading results). */
export async function cleanExportDir(appId: string): Promise<void> {
  const exportDir = join(WEB_CWD, '.ghosted-local', 'exports', appId)
  await rm(exportDir, { recursive: true, force: true })
}
