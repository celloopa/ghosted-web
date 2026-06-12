/**
 * Integration smoke test: actually invoke typst + validate_ats.py.
 * Run once manually: pnpm --filter web exec vitest run test/e2e-export.test.ts
 * NOT included in the default test suite (separate file, not matched by default glob
 * since vitest.config.ts only includes test/*.test.{ts,tsx} — this file IS included).
 * Tag: integration (skip in CI by env).
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildResumeModel, buildExpectations } from '@ghosted/core'
import { runExport, cleanExportDir, generateResumeTyp } from '../lib/server/typstExport'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'

const execFile = promisify(_execFile)

const CV_PATH = '/Users/cello_r/Documents/code/ghosted/local/cv.json'

const SAMPLE_COVER_LETTER = `At Asheville Dispensary I built a design system and React component library that ships across web, print, and packaging. I brought three client organizations to WCAG 2.1 compliance and have the Git workflow discipline to keep every change reviewable.

The role matches my current stack. I would be glad to pair on a problem or walk through the codebase.

Marcelo Rondon`

const MATCHED_KEYWORDS = ['React', 'TypeScript', 'design system', 'accessibility', 'WCAG']

// A real font available on this machine (confirmed via typst fonts)
const CUSTOM_FONT = 'Source Sans 3'
const CUSTOM_ACCENT = '#8a6120'

describe.skipIf(process.env.CI === 'true')('E2E export integration', () => {
  it('plain-ats: compiles PDFs and validates them through the ATS checker', async () => {
    const cvJson = await readFile(CV_PATH, 'utf8')

    const resumeModel = buildResumeModel(cvJson, {
      summary: 'Front-end engineer with 4+ years building React, TypeScript, and design-system products.',
      skillsOrder: ['React', 'TypeScript', 'CSS', 'JavaScript', 'Figma', 'HTML', 'Tailwind', 'Git', 'Go', 'Python'],
    })
    expect(resumeModel, 'CV must parse correctly').not.toBeNull()

    const expectations = buildExpectations(resumeModel!, MATCHED_KEYWORDS)

    const appId = `e2e-plain-${Date.now()}`
    let result: Awaited<ReturnType<typeof runExport>>
    try {
      result = await runExport({
        appId,
        resumeModel: resumeModel!,
        coverLetter: SAMPLE_COVER_LETTER,
        expectations,
        style: { template: 'plain-ats' },
      })
    } finally {
      await cleanExportDir(appId).catch(() => undefined)
    }

    const resumeBytes = Buffer.from(result.resume.pdfBase64, 'base64')
    const coverBytes = Buffer.from(result.cover.pdfBase64, 'base64')
    expect(resumeBytes.length).toBeGreaterThan(10_000)
    expect(coverBytes.length).toBeGreaterThan(5_000)

    console.log('\n── Plain-ATS Resume ATS report ──')
    console.log(result.resume.ats.report)
    console.log(`Resume ATS pass: ${result.resume.ats.pass}`)
    console.log('\n── Plain-ATS Cover ATS report ──')
    console.log(result.cover.ats.report)
    console.log(`Cover ATS pass: ${result.cover.ats.pass}`)

    expect(result.resume.ats.pass, `Plain-ATS Resume ATS failed:\n${result.resume.ats.report}`).toBe(true)
    expect(result.cover.ats.pass, `Plain-ATS Cover ATS failed:\n${result.cover.ats.report}`).toBe(true)
    expect(result.cover.ats.report).toContain('PASS  single page')
    expect(result.cover.ats.report).toContain('PASS  word count')
    expect(result.cover.ats.report).toContain('PASS  text extracted')
  }, 60_000)

  it('modern: compiles PDFs with custom accent+font and passes ATS', async () => {
    const cvJson = await readFile(CV_PATH, 'utf8')

    const resumeModel = buildResumeModel(cvJson, {
      summary: 'Front-end engineer with 4+ years building React, TypeScript, and design-system products.',
      skillsOrder: ['React', 'TypeScript', 'CSS', 'JavaScript', 'Figma', 'HTML', 'Tailwind', 'Git', 'Go', 'Python'],
    })
    expect(resumeModel, 'CV must parse correctly').not.toBeNull()

    const expectations = buildExpectations(resumeModel!, MATCHED_KEYWORDS)

    const appId = `e2e-modern-${Date.now()}`
    let result: Awaited<ReturnType<typeof runExport>>
    try {
      result = await runExport({
        appId,
        resumeModel: resumeModel!,
        coverLetter: SAMPLE_COVER_LETTER,
        expectations,
        style: { template: 'modern', accentColor: CUSTOM_ACCENT, font: CUSTOM_FONT },
      })
    } finally {
      await cleanExportDir(appId).catch(() => undefined)
    }

    const resumeBytes = Buffer.from(result.resume.pdfBase64, 'base64')
    const coverBytes = Buffer.from(result.cover.pdfBase64, 'base64')
    expect(resumeBytes.length).toBeGreaterThan(10_000)
    expect(coverBytes.length).toBeGreaterThan(5_000)

    console.log('\n── Modern Resume ATS report ──')
    console.log(result.resume.ats.report)
    console.log(`Resume ATS pass: ${result.resume.ats.pass}`)
    console.log('\n── Modern Cover ATS report ──')
    console.log(result.cover.ats.report)
    console.log(`Cover ATS pass: ${result.cover.ats.pass}`)

    expect(result.resume.ats.pass, `Modern Resume ATS failed:\n${result.resume.ats.report}`).toBe(true)
    expect(result.cover.ats.pass, `Modern Cover ATS failed:\n${result.cover.ats.report}`).toBe(true)
    expect(result.cover.ats.report).toContain('PASS  single page')
    expect(result.cover.ats.report).toContain('PASS  word count')
    expect(result.cover.ats.report).toContain('PASS  text extracted')
  }, 60_000)

  it('modern: compiled resume PDF contains candidate name when extracted with pdftotext', async () => {
    const cvJson = await readFile(CV_PATH, 'utf8')
    const resumeModel = buildResumeModel(cvJson, {
      summary: 'Front-end engineer with 4+ years building React, TypeScript.',
      skillsOrder: ['React', 'TypeScript', 'CSS'],
    })
    expect(resumeModel).not.toBeNull()

    const typ = generateResumeTyp(resumeModel!, { template: 'modern', accentColor: CUSTOM_ACCENT, font: CUSTOM_FONT })

    const scratchDir = join(tmpdir(), `ghosted-modern-scratch-${Date.now()}`)
    await mkdir(scratchDir, { recursive: true })
    const typPath = join(scratchDir, 'resume.typ')
    const pdfPath = join(scratchDir, 'resume.pdf')

    await writeFile(typPath, typ, 'utf8')

    const env = { ...process.env, HOME: process.env.HOME ?? require('node:os').homedir() }
    await execFile('typst', ['compile', typPath, pdfPath], { env })

    // pdftotext may not be installed in all envs — skip extraction check gracefully
    try {
      const { stdout } = await execFile('pdftotext', [pdfPath, '-'], { env })
      const firstLines = stdout.split('\n').slice(0, 5)
      console.log('\n── Extracted header lines (modern resume) ──')
      console.log(firstLines.join('\n'))
      // The candidate name must appear in the extracted text
      const fullText = stdout
      expect(fullText).toMatch(/Marcelo|Rondon/)
    } catch (err) {
      const e2 = err as Error & { code?: string }
      if (e2.code === 'ENOENT' || (e2.message ?? '').includes('not found')) {
        console.log('pdftotext not available — skipping text extraction check')
      } else {
        throw err
      }
    }
  }, 60_000)
})
