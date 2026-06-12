/**
 * Integration smoke test: actually invoke typst + validate_ats.py.
 * Run once manually: pnpm --filter web exec vitest run test/e2e-export.test.ts
 * NOT included in the default test suite (separate file, not matched by default glob
 * since vitest.config.ts only includes test/*.test.{ts,tsx} — this file IS included).
 * Tag: integration (skip in CI by env).
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { buildResumeModel, buildExpectations } from '@ghosted/core'
import { runExport, cleanExportDir } from '../lib/server/typstExport'

const CV_PATH = '/Users/cello_r/Documents/code/ghosted/local/cv.json'

const SAMPLE_COVER_LETTER = `At Asheville Dispensary I built a design system and React component library that ships across web, print, and packaging. I brought three client organizations to WCAG 2.1 compliance and have the Git workflow discipline to keep every change reviewable.

The role matches my current stack. I would be glad to pair on a problem or walk through the codebase.

Marcelo Rondon`

const MATCHED_KEYWORDS = ['React', 'TypeScript', 'design system', 'accessibility', 'WCAG']

describe.skipIf(process.env.CI === 'true')('E2E export integration', () => {
  it('compiles PDFs and validates them through the ATS checker', async () => {
    const cvJson = await readFile(CV_PATH, 'utf8')

    const resumeModel = buildResumeModel(cvJson, {
      summary: 'Front-end engineer with 4+ years building React, TypeScript, and design-system products.',
      skillsOrder: ['React', 'TypeScript', 'CSS', 'JavaScript', 'Figma', 'HTML', 'Tailwind', 'Git', 'Go', 'Python'],
    })
    expect(resumeModel, 'CV must parse correctly').not.toBeNull()

    const expectations = buildExpectations(resumeModel!, MATCHED_KEYWORDS)

    const appId = `e2e-test-${Date.now()}`
    let result: Awaited<ReturnType<typeof runExport>>
    try {
      result = await runExport({
        appId,
        resumeModel: resumeModel!,
        coverLetter: SAMPLE_COVER_LETTER,
        expectations,
      })
    } finally {
      await cleanExportDir(appId).catch(() => undefined)
    }

    // PDFs must be non-trivial
    const resumeBytes = Buffer.from(result.resume.pdfBase64, 'base64')
    const coverBytes = Buffer.from(result.cover.pdfBase64, 'base64')
    expect(resumeBytes.length).toBeGreaterThan(10_000)
    expect(coverBytes.length).toBeGreaterThan(5_000)

    // Print validator reports for inspection
    console.log('\n── Resume ATS report ──')
    console.log(result.resume.ats.report)
    console.log(`Resume ATS pass: ${result.resume.ats.pass}`)
    console.log('\n── Cover ATS report ──')
    console.log(result.cover.ats.report)
    console.log(`Cover ATS pass: ${result.cover.ats.pass}`)

    // Resume must pass ATS
    expect(result.resume.ats.pass, `Resume ATS failed:\n${result.resume.ats.report}`).toBe(true)
    // Cover must pass ATS (page-count bug fixed: trailing form-feed stripped before counting)
    expect(result.cover.ats.pass, `Cover ATS failed:\n${result.cover.ats.report}`).toBe(true)
    expect(result.cover.ats.report).toContain('PASS  single page')
    expect(result.cover.ats.report).toContain('PASS  word count')
    expect(result.cover.ats.report).toContain('PASS  text extracted')
  }, 60_000)
})
