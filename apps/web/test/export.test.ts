// Unit tests for the Typst document generators.
// These run in vitest with jsdom; they do NOT invoke typst or the ATS validator.
import { describe, it, expect } from 'vitest'
import { generateResumeTyp, generateCoverLetterTyp } from '../lib/server/typstExport'
import type { ResumeModel } from '@ghosted/core'

const MODEL: ResumeModel = {
  name: 'Marcelo Rondon',
  email: 'cello@cello.design',
  phone: '(305) 496-0039',
  location: 'Portland, Oregon',
  links: [
    { label: 'cello.design', url: 'https://cello.design' },
    { label: 'celloopa', url: 'https://github.com/celloopa' },
  ],
  summary: 'Design engineer specializing in React, TypeScript, and design systems.',
  work: [
    {
      name: 'Asheville Dispensary',
      position: 'Design Lead / Front-End Developer',
      start: '2022-01',
      end: '',
      highlights: [
        'Built reusable UI components integrated into WordPress.',
        'Developed an internal asset management system using React, TypeScript.',
        'Implemented a scalable design system in Figma.',
      ],
    },
    {
      name: 'The Green Phial',
      position: 'Senior Designer / Web Developer',
      start: '2022-10',
      end: '2024-01',
      highlights: ['Redesigned WordPress site.'],
    },
  ],
  skills: ['React', 'TypeScript', 'Figma', 'CSS'],
  education: [
    { institution: 'University of Florida', area: 'Visual Journalism', year: '2019' },
  ],
}

// ── generateResumeTyp ─────────────────────────────────────────────────────────

describe('generateResumeTyp', () => {
  const typ = generateResumeTyp(MODEL)

  it('includes the candidate name escaped in the output', () => {
    expect(typ).toContain('Marcelo Rondon')
  })

  it('includes email (@ is escaped to \\@ in typst output)', () => {
    // typstEscape turns @ into \@ for safety; check for the escaped form
    expect(typ).toContain('cello\\@cello.design')
  })

  it('contains Experience heading before Skills heading before Education heading', () => {
    const expIdx = typ.indexOf('"Experience"')
    const skillsIdx = typ.indexOf('"Skills"')
    const eduIdx = typ.indexOf('"Education"')
    expect(expIdx).toBeGreaterThan(-1)
    expect(skillsIdx).toBeGreaterThan(expIdx)
    expect(eduIdx).toBeGreaterThan(skillsIdx)
  })

  it('sets ligatures: false', () => {
    expect(typ).toContain('ligatures: false')
  })

  it('sets hyphenate: false', () => {
    expect(typ).toContain('hyphenate: false')
  })

  it('does NOT use tables or grids (ATS-safe single column)', () => {
    expect(typ).not.toContain('#table(')
    expect(typ).not.toContain('#grid(')
    expect(typ).not.toContain('columns:')
  })

  it('includes work highlights as bullets', () => {
    expect(typ).toContain('Built reusable UI components integrated into WordPress.')
    expect(typ).toContain('Implemented a scalable design system in Figma.')
  })

  it('escapes a hash injection in user content', () => {
    const evilModel: ResumeModel = {
      ...MODEL,
      summary: '#set text(fill: red)',
    }
    const out = generateResumeTyp(evilModel)
    // The raw # command must not appear unescaped at the start of the summary content
    expect(out).toContain('\\#set text(fill: red)')
    expect(out).not.toMatch(/"#set text\(fill: red\)"/)
  })

  it('uses Present for an open-ended work entry', () => {
    expect(typ).toContain('2022 – Present')
  })

  it('formats closed date range correctly', () => {
    expect(typ).toContain('2022 – 2024')
  })

  it('includes skills in order', () => {
    const skillsSection = typ.slice(typ.indexOf('"Skills"'))
    expect(skillsSection.indexOf('React')).toBeLessThan(skillsSection.indexOf('CSS'))
  })

  it('includes education institution', () => {
    expect(typ).toContain('University of Florida')
    expect(typ).toContain('2019')
  })
})

// ── generateCoverLetterTyp ────────────────────────────────────────────────────

describe('generateCoverLetterTyp', () => {
  const body =
    'Thank you for considering my application for the Frontend Engineer role. ' +
    'I have spent three years building React and TypeScript products.\n\n' +
    'Best regards,\nMarcelo'

  const typ = generateCoverLetterTyp({
    name: 'Marcelo Rondon',
    email: 'cello@cello.design',
    company: 'Acme Corp',
    position: 'Frontend Engineer',
    body,
  })

  it('contains the name', () => {
    expect(typ).toContain('Marcelo Rondon')
  })

  it('contains the email (@ escaped)', () => {
    expect(typ).toContain('cello\\@cello.design')
  })

  it('sets ligatures: false', () => {
    expect(typ).toContain('ligatures: false')
  })

  it('sets hyphenate: false', () => {
    expect(typ).toContain('hyphenate: false')
  })

  it('does NOT use tables or grids', () => {
    expect(typ).not.toContain('#table(')
    expect(typ).not.toContain('#grid(')
  })

  it('renders each paragraph from the body', () => {
    expect(typ).toContain('Thank you for considering')
    expect(typ).toContain('Best regards')
  })

  it('escapes a raw # injection in body content', () => {
    const evilBody = '#import "hack.typ": *\n\nReal paragraph.'
    const out = generateCoverLetterTyp({
      name: 'X',
      email: 'x@x.com',
      company: 'Y',
      position: 'Z',
      body: evilBody,
    })
    expect(out).toContain('\\#import')
    expect(out).not.toContain('#import "hack.typ"')
  })
})
