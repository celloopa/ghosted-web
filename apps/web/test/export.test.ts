// Unit tests for the Typst document generators.
// These run in vitest with jsdom; they do NOT invoke typst or the ATS validator.
import { describe, it, expect } from 'vitest'
import { generateResumeTyp, generateCoverLetterTyp } from '../lib/server/typstExport'
import type { ResumeModel, DocStyle } from '@ghosted/core'

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
  modern: {
    firstname: 'Marcelo',
    lastname: 'Rondon',
    homepage: 'https://cello.design',
    github: 'celloopa',
    linkedin: 'marcelorondon',
    positions: ['Design Engineer', 'React / TypeScript'],
  },
}

const MODERN_STYLE: DocStyle = { template: 'modern' }
const PLAIN_STYLE: DocStyle = { template: 'plain-ats' }

// ── generateResumeTyp — modern template ───────────────────────────────────────

describe('generateResumeTyp (modern template)', () => {
  const typ = generateResumeTyp(MODEL, MODERN_STYLE)

  it('imports modern-cv 0.9.0', () => {
    expect(typ).toContain('#import "@preview/modern-cv:0.9.0": *')
  })

  it('emits resume.with author block with firstname/lastname', () => {
    expect(typ).toContain('firstname: "Marcelo"')
    expect(typ).toContain('lastname: "Rondon"')
  })

  it('includes email in author block (@ NOT escaped in string literals — raw @ so mailto link works)', () => {
    // In Typst string literals (dict values), @ does not need escaping.
    // Escaping it to \@ would produce a literal backslash in the mailto URL.
    expect(typ).toContain('email: "cello@cello.design"')
  })

  it('includes github and linkedin in author block', () => {
    expect(typ).toContain('github: "celloopa"')
    expect(typ).toContain('linkedin: "marcelorondon"')
  })

  it('includes positions array', () => {
    expect(typ).toContain('"Design Engineer"')
  })

  it('contains = Experience before = Skills before = Education', () => {
    const expIdx = typ.indexOf('= Experience')
    const skillsIdx = typ.indexOf('= Skills')
    const eduIdx = typ.indexOf('= Education')
    expect(expIdx).toBeGreaterThan(-1)
    expect(skillsIdx).toBeGreaterThan(expIdx)
    expect(eduIdx).toBeGreaterThan(skillsIdx)
  })

  it('includes work highlights as resume-item bullets', () => {
    expect(typ).toContain('Built reusable UI components integrated into WordPress.')
    expect(typ).toContain('Implemented a scalable design system in Figma.')
  })

  it('includes education institution', () => {
    expect(typ).toContain('University of Florida')
  })

  it('escapes a hash injection in resume-item content (content mode)', () => {
    // Highlights go into content mode [  - text ]; # must be escaped there
    const evilModel: ResumeModel = {
      ...MODEL,
      work: [{
        ...MODEL.work[0]!,
        highlights: ['#set text(fill: red) — injected'],
      }],
    }
    const out = generateResumeTyp(evilModel, MODERN_STYLE)
    // Content mode: the # in the highlight bullet must be escaped
    expect(out).toContain('\\#set text(fill: red)')
  })

  it('injects accentColor into resume.with when set', () => {
    const out = generateResumeTyp(MODEL, { template: 'modern', accentColor: '#ff5500' })
    expect(out).toContain('accent-color: "#ff5500"')
  })

  it('injects custom font into resume.with when set, with package defaults as fallback', () => {
    const out = generateResumeTyp(MODEL, { template: 'modern', font: 'Geist' })
    expect(out).toContain('"Geist"')
    expect(out).toContain('"Source Sans Pro"')
  })

  it('does not emit accent-color line when accentColor is absent', () => {
    expect(typ).not.toContain('accent-color:')
  })
})

// ── generateResumeTyp — plain-ATS template ────────────────────────────────────

describe('generateResumeTyp (plain-ats template)', () => {
  const typ = generateResumeTyp(MODEL, PLAIN_STYLE)

  it('includes the candidate name escaped in the output', () => {
    expect(typ).toContain('Marcelo Rondon')
  })

  it('includes email (@ is escaped to \\@ in typst output)', () => {
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
    const out = generateResumeTyp(evilModel, PLAIN_STYLE)
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

  it('injects custom font into #set text when provided', () => {
    const out = generateResumeTyp(MODEL, { template: 'plain-ats', font: 'Geist' })
    expect(out).toContain('"Geist"')
  })
})

// ── generateCoverLetterTyp — modern template ──────────────────────────────────

describe('generateCoverLetterTyp (modern template)', () => {
  const body =
    'Thank you for considering my application for the Frontend Engineer role. ' +
    'I have spent three years building React and TypeScript products.\n\n' +
    'Best regards,\nMarcelo'

  const input = {
    name: 'Marcelo Rondon',
    email: 'cello@cello.design',
    company: 'Acme Corp',
    position: 'Frontend Engineer',
    body,
  }

  const typ = generateCoverLetterTyp(input, MODERN_STYLE)

  it('imports modern-cv 0.9.0', () => {
    expect(typ).toContain('#import "@preview/modern-cv:0.9.0": *')
  })

  it('contains the name split into firstname/lastname in author block', () => {
    expect(typ).toContain('firstname: "Marcelo"')
    expect(typ).toContain('lastname: "Rondon"')
  })

  it('contains the email in author block (@ NOT escaped in string literal)', () => {
    // String literals in Typst dict values: @ is safe, no escaping needed.
    // Escaping would produce literal \@ in the mailto URL.
    expect(typ).toContain('email: "cello@cello.design"')
  })

  it('emits hiring-entity-info with company', () => {
    expect(typ).toContain('#hiring-entity-info(')
    expect(typ).toContain('Acme Corp')
  })

  it('emits letter-heading with position', () => {
    expect(typ).toContain('#letter-heading(')
    expect(typ).toContain('Frontend Engineer')
  })

  it('wraps each paragraph in #coverletter-content[]', () => {
    const count = (typ.match(/#coverletter-content\[/g) ?? []).length
    expect(count).toBe(2) // two paragraphs in the body
  })

  it('renders paragraph text inside coverletter-content', () => {
    expect(typ).toContain('Thank you for considering')
    expect(typ).toContain('Best regards')
  })

  it('escapes a raw # injection in body content', () => {
    const evilBody = '#import "hack.typ": *\n\nReal paragraph.'
    const out = generateCoverLetterTyp({ ...input, body: evilBody }, MODERN_STYLE)
    expect(out).toContain('\\#import')
    expect(out).not.toContain('#import "hack.typ"')
  })

  it('injects accentColor into coverletter.with when set', () => {
    const out = generateCoverLetterTyp(input, { template: 'modern', accentColor: '#ff5500' })
    expect(out).toContain('accent-color: "#ff5500"')
  })
})

// ── generateCoverLetterTyp — plain-ATS template ───────────────────────────────

describe('generateCoverLetterTyp (plain-ats template)', () => {
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
  }, PLAIN_STYLE)

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
    }, PLAIN_STYLE)
    expect(out).toContain('\\#import')
    expect(out).not.toContain('#import "hack.typ"')
  })
})
