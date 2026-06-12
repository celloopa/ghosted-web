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
import type { ResumeModel, AtsExpectations } from '@ghosted/core'
import { typstEscape } from '@ghosted/core'

const execFile = promisify(_execFile)

// ─────────────────────────────────────────────────────────────────────────────
// Environment helpers
// ─────────────────────────────────────────────────────────────────────────────

function hardenedEnv(): NodeJS.ProcessEnv {
  const extraPaths = [`${homedir()}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'].join(':')
  return {
    ...process.env,
    PATH: `${process.env.PATH ?? ''}:${extraPaths}`,
  }
}

const TYPST_BIN = process.env.GHOSTED_TYPST_BIN ?? 'typst'
const PYTHON3_BIN = process.env.GHOSTED_PYTHON3_BIN ?? 'python3'
// CWD of the web app at runtime (Next.js sets this to the project root)
const WEB_CWD = process.cwd()

// ─────────────────────────────────────────────────────────────────────────────
// Typst document generators
// ─────────────────────────────────────────────────────────────────────────────

function e(s: string): string {
  return typstEscape(s)
}

/** Format a start/end year pair for display. endDate empty string → "Present". */
function fmtDates(start?: string, end?: string): string {
  const s = start ? start.slice(0, 4) : ''
  const en = !end || end.trim() === '' ? 'Present' : end.slice(0, 4)
  return s ? `${s} – ${en}` : en
}

/**
 * Produce a complete Typst resume document from a ResumeModel.
 * Preserves all ATS-safe properties from the vendored template:
 *   - single column layout (no table/grid)
 *   - ligatures: false
 *   - hyphenate: false
 *   - headings "Experience", "Skills", "Education" in that exact order
 */
export function generateResumeTyp(model: ResumeModel): string {
  const lines: string[] = []

  // Page and text settings — must match the vendored template's ATS-safe settings
  // Slightly tighter margins + smaller font to keep the full CV within 2 pages.
  lines.push('#set page(paper: "us-letter", margin: (x: 0.65in, y: 0.55in))')
  lines.push('#set text(font: "Libertinus Serif", size: 9.5pt, ligatures: false, hyphenate: false)')
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
  if (model.location) {
    const contactLine = [model.location, model.email, model.phone].filter(Boolean).join(' · ')
    lines.push(`  #text(size: 9.5pt)["${e(contactLine)}"] \\`)
  } else {
    const contactLine = [model.email, model.phone].filter(Boolean).join(' · ')
    lines.push(`  #text(size: 9.5pt)["${e(contactLine)}"] \\`)
  }
  if (model.links.length > 0) {
    const linkLine = model.links.map((l) => l.label).join(' · ')
    lines.push(`  #text(size: 9.5pt)["${e(linkLine)}"]`)
  }
  lines.push(']')
  lines.push('#v(2pt)')

  // Summary
  if (model.summary) {
    lines.push(`"${e(model.summary)}"`)
    lines.push('#v(3pt)')
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
    lines.push(`  "${e(w.position ?? '')}",`)
    lines.push(`  "${e(dates)}",`)
    lines.push(`  "${e(loc)}",`)
    lines.push(`  (`)
    lines.push(`    ${bulletArray},`)
    lines.push(`  ),`)
    lines.push(`)`)
  }
  lines.push('')

  // ── SKILLS ──
  lines.push('#section("Skills")')
  if (model.skills.length > 0) {
    lines.push(model.skills.map((s) => e(s)).join(', '))
  }
  lines.push('')

  // ── EDUCATION ──
  lines.push('#section("Education")')
  for (const edu of model.education) {
    const yearPart = edu.year ? ` (${edu.year})` : ''
    const areaPart = edu.area ? ` — ${edu.area}${yearPart}` : yearPart
    lines.push(`#text(weight: "bold")["${e(edu.institution)}"]`)
    if (areaPart) {
      lines.push(`"${e(areaPart)}"`)
    }
    lines.push('#v(3pt)')
  }

  return lines.join('\n')
}

export interface CoverLetterInput {
  name: string
  email: string
  company: string
  position: string
  /** Pre-written body. May contain multiple paragraphs separated by \n\n. Already includes sign-off. */
  body: string
}

/**
 * Produce a minimal single-column Typst cover letter document.
 * ATS-safe: single column, no tables, ligatures off, hyphenate off.
 */
export function generateCoverLetterTyp(input: CoverLetterInput): string {
  const lines: string[] = []

  lines.push('#set page(paper: "us-letter", margin: (x: 1in, y: 0.65in))')
  lines.push('#set text(font: "Libertinus Serif", size: 10pt, ligatures: false, hyphenate: false)')
  lines.push('#set par(justify: false, leading: 0.55em)')
  lines.push('')

  // Contact header (name + email)
  const contact = [input.name, input.email].filter(Boolean).join(' · ')
  lines.push(`#text(weight: "bold")["${e(contact)}"]`)
  lines.push('#v(8pt)')

  // Body: split paragraphs by double newline and render each
  const paragraphs = input.body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  for (const para of paragraphs) {
    // Typst requires raw content or string; use content mode for the paragraph
    // by emitting it as a bare string literal after a par reset
    lines.push(`#par["${e(para)}"]`)
    lines.push('#v(6pt)')
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// runExport
// ─────────────────────────────────────────────────────────────────────────────

export interface RunExportInput {
  appId: string
  resumeModel: ResumeModel
  coverLetter: string
  expectations: AtsExpectations
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

  // Write source files
  const resumeTyp = generateResumeTyp(input.resumeModel)
  const coverTyp = generateCoverLetterTyp({
    name: input.resumeModel.name,
    email: input.resumeModel.email,
    company: 'Company', // cover letter body already has the company name
    position: 'Position',
    body: input.coverLetter,
  })

  await Promise.all([
    writeFile(resumeTypPath, resumeTyp, 'utf8'),
    writeFile(coverTypPath, coverTyp, 'utf8'),
    writeFile(expectPath, JSON.stringify(input.expectations, null, 2), 'utf8'),
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
