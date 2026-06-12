import { describe, it, expect } from 'vitest'
import { buildDownloadName, defaultView } from '../lib/applyHelpers'
import type { Application } from '@ghosted/core'

// ---- buildDownloadName ----

describe('buildDownloadName', () => {
  it('slugifies a plain company name', () => {
    expect(buildDownloadName('Figma', 'cover-letter')).toBe('figma-cover-letter.md')
  })

  it('slugifies a multi-word company name', () => {
    expect(buildDownloadName('Figma Corp', 'cover-letter')).toBe('figma-corp-cover-letter.md')
  })

  it('handles punctuation and extra spaces', () => {
    expect(buildDownloadName('Stripe, Inc.', 'resume-adjustments')).toBe('stripe-inc-resume-adjustments.md')
  })

  it('collapses multiple separators into one dash', () => {
    expect(buildDownloadName('Arc   Browser!!!', 'cover-letter')).toBe('arc-browser-cover-letter.md')
  })

  it('strips leading and trailing dashes', () => {
    expect(buildDownloadName('  --Odd Co--  ', 'resume-adjustments')).toBe('odd-co-resume-adjustments.md')
  })

  it('falls back to "company" for a blank or symbol-only name', () => {
    expect(buildDownloadName('', 'cover-letter')).toBe('company-cover-letter.md')
    expect(buildDownloadName('!!!', 'cover-letter')).toBe('company-cover-letter.md')
  })

  it('uses resume-adjustments kind', () => {
    expect(buildDownloadName('Linear', 'resume-adjustments')).toBe('linear-resume-adjustments.md')
  })
})

// ---- defaultView ----

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'test-id',
    company: 'TestCo',
    position: 'Designer',
    role_type: 'other',
    status: 'saved',
    events: [],
    posting: {
      description: 'a job',
      fit_score: 72,
      fit_notes: [],
      matched: [],
      missing: [],
      analyzed_at: '2026-06-11',
    },
    ...overrides,
  }
}

describe('defaultView', () => {
  it('returns "workspace" when app has no materials', () => {
    const app = makeApp()
    expect(defaultView(app)).toBe('workspace')
  })

  it('returns "workspace" when materials exist but cover_letter is absent', () => {
    const app = makeApp({ materials: { resume_adjustments: 'some text' } })
    expect(defaultView(app)).toBe('workspace')
  })

  it('returns "workspace" when cover_letter is an empty string', () => {
    const app = makeApp({ materials: { cover_letter: '' } })
    expect(defaultView(app)).toBe('workspace')
  })

  it('returns "finale" when app has a cover letter', () => {
    const app = makeApp({ materials: { cover_letter: 'Dear hiring team…' } })
    expect(defaultView(app)).toBe('finale')
  })

  it('returns "finale" regardless of other materials fields when cover_letter is present', () => {
    const app = makeApp({
      materials: {
        cover_letter: 'Hello.',
        resume_adjustments: 'Adjust bullets.',
        generated_at: '2026-06-11T10:00:00Z',
        revisions: 3,
      },
    })
    expect(defaultView(app)).toBe('finale')
  })
})
