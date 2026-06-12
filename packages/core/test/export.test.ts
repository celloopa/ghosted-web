import { describe, it, expect } from 'vitest'
import {
  buildResumeModel,
  buildExpectations,
  typstEscape,
  type ResumeModel,
} from '../src/export'

// ── Extended fixture for keyword-variant tests ────────────────────────────────
// A CV whose work highlights say "prototypes" (alias), never "Prototyping" (canonical).
// Also says "cross-functional teams" (alias), never "Cross-functional Collaboration".
const CV_WITH_ALIASES = JSON.stringify({
  basics: {
    name: 'Marcelo Rondon',
    email: 'cello@cello.design',
    summary: 'We built prototypes of key interactions and worked with cross-functional teams.',
  },
  work: [
    {
      name: 'Alias Co',
      position: 'Design Engineer',
      startDate: '2022-01',
      highlights: [
        'Built prototypes for every user flow.',
        'Coordinated with cross-functional teams across time zones.',
      ],
    },
  ],
  skills: [{ name: 'React' }, { name: 'TypeScript' }],
  education: [],
})

// ── Fixture ──────────────────────────────────────────────────────────────────

const FULL_CV = JSON.stringify({
  basics: {
    name: 'Marcelo Rondon',
    email: 'cello@cello.design',
    phone: '(305) 496-0039',
    url: 'https://cello.design',
    summary: 'Designer who codes.',
    location: { city: 'Portland', region: 'Oregon' },
    profiles: [
      { network: 'GitHub', url: 'https://github.com/celloopa', username: 'celloopa' },
      { network: 'LinkedIn', url: 'https://linkedin.com/in/marcelorondon', username: 'marcelorondon' },
    ],
  },
  work: [
    {
      name: 'Asheville Dispensary',
      position: 'Design Lead / Front-End Developer',
      startDate: '2022-01',
      endDate: '',
      highlights: [
        'Built reusable UI components.',
        'Developed an internal asset management system using React, TypeScript.',
        'Implemented a scalable design system in Figma.',
      ],
    },
    {
      name: 'The Green Phial',
      position: 'Senior Designer / Web Developer',
      startDate: '2022-10',
      endDate: '2024-01',
      highlights: ['Redesigned WordPress site.', 'Translated UI mockups.'],
    },
  ],
  skills: [{ name: 'React' }, { name: 'TypeScript' }, { name: 'Figma' }, { name: 'CSS' }],
  education: [
    {
      institution: 'University of Florida',
      area: 'Visual Journalism',
      startDate: '2016-08',
      endDate: '2019-12',
    },
  ],
})

// ── buildResumeModel ──────────────────────────────────────────────────────────

describe('buildResumeModel', () => {
  it('returns a valid model from well-formed JSON Resume', () => {
    const m = buildResumeModel(FULL_CV)
    expect(m).not.toBeNull()
    expect(m!.name).toBe('Marcelo Rondon')
    expect(m!.email).toBe('cello@cello.design')
    expect(m!.phone).toBe('(305) 496-0039')
  })

  it('builds location from city + region', () => {
    const m = buildResumeModel(FULL_CV)!
    expect(m.location).toBe('Portland, Oregon')
  })

  it('builds links from url and profiles', () => {
    const m = buildResumeModel(FULL_CV)!
    expect(m.links.length).toBeGreaterThanOrEqual(3) // website + github + linkedin
    expect(m.links.some((l) => l.url.includes('cello.design'))).toBe(true)
    expect(m.links.some((l) => l.url.includes('github.com'))).toBe(true)
  })

  it('uses agent-supplied summary over CV summary', () => {
    const m = buildResumeModel(FULL_CV, { summary: 'Custom summary for the job.' })!
    expect(m.summary).toBe('Custom summary for the job.')
  })

  it('uses CV summary when agent summary is absent', () => {
    const m = buildResumeModel(FULL_CV)!
    expect(m.summary).toBe('Designer who codes.')
  })

  it('applies bulletOrder override for named role', () => {
    const m = buildResumeModel(FULL_CV, {
      bulletOrder: [
        {
          name: 'Asheville Dispensary',
          // put index 2 first, then 1, then 0
          order: [2, 1, 0],
        },
      ],
    })!
    const role = m.work.find((w) => w.name === 'Asheville Dispensary')!
    expect(role.highlights[0]).toContain('Figma')
    expect(role.highlights[1]).toContain('React')
    expect(role.highlights[2]).toContain('UI components')
  })

  it('keeps original order for roles not in bulletOrder', () => {
    const m = buildResumeModel(FULL_CV, {
      bulletOrder: [{ name: 'Asheville Dispensary', order: [2, 1, 0] }],
    })!
    const phial = m.work.find((w) => w.name === 'The Green Phial')!
    expect(phial.highlights[0]).toContain('WordPress')
  })

  it('uses skillsOrder when provided', () => {
    const m = buildResumeModel(FULL_CV, { skillsOrder: ['Figma', 'CSS', 'React', 'TypeScript'] })!
    expect(m.skills[0]).toBe('Figma')
    expect(m.skills[1]).toBe('CSS')
  })

  it('returns null for garbage cvJson', () => {
    expect(buildResumeModel('not json at all')).toBeNull()
    expect(buildResumeModel('null')).toBeNull()
    expect(buildResumeModel('[]')).toBeNull()
    expect(buildResumeModel('')).toBeNull()
  })

  it('returns null when name or email is missing', () => {
    const noName = JSON.stringify({ basics: { email: 'a@b.com' } })
    const noEmail = JSON.stringify({ basics: { name: 'Someone' } })
    expect(buildResumeModel(noName)).toBeNull()
    expect(buildResumeModel(noEmail)).toBeNull()
  })

  it('tolerates missing work / skills / education sections', () => {
    const minimal = JSON.stringify({ basics: { name: 'Dev', email: 'd@x.io' } })
    const m = buildResumeModel(minimal)
    expect(m).not.toBeNull()
    expect(m!.work).toEqual([])
    expect(m!.skills).toEqual([])
    expect(m!.education).toEqual([])
  })
})

// ── buildExpectations ─────────────────────────────────────────────────────────

describe('buildExpectations', () => {
  const model = buildResumeModel(FULL_CV)!

  it('always includes name and email in required_strings', () => {
    const exp = buildExpectations(model, [])
    expect(exp.required_strings).toContain('Marcelo Rondon')
    expect(exp.required_strings).toContain('cello@cello.design')
  })

  it('sets ordered_headings to exactly Experience/Skills/Education', () => {
    const exp = buildExpectations(model, [])
    expect(exp.ordered_headings).toEqual(['Experience', 'Skills', 'Education'])
  })

  it('lowercases and caps matched keywords at 5 (after filtering absent terms)', () => {
    // All 7 of these have an alias present in FULL_CV's haystack
    // React, TypeScript, Figma, CSS, Design Systems, WordPress, UI
    const kws = ['React', 'TypeScript', 'Figma', 'CSS', 'Design Systems', 'WordPress', 'UI']
    const exp = buildExpectations(model, kws)
    expect(exp.required_keywords).toHaveLength(5)
    expect(exp.required_keywords.every((k) => k === k.toLowerCase())).toBe(true)
  })

  it('deduplicates keywords (case-insensitive)', () => {
    const exp = buildExpectations(model, ['React', 'react', 'REACT'])
    expect(exp.required_keywords).toHaveLength(1)
  })

  it('extracts unique 4-digit years from work start/end dates', () => {
    const exp = buildExpectations(model, [])
    expect(exp.required_years).toContain('2022')
    expect(exp.required_years).toContain('2024')
    // Unique — no duplicates
    expect(new Set(exp.required_years).size).toBe(exp.required_years.length)
  })

  it('sets max_pages to 2', () => {
    const exp = buildExpectations(model, [])
    expect(exp.max_pages).toBe(2)
  })
})

// ── typstEscape ───────────────────────────────────────────────────────────────

describe('typstEscape', () => {
  it('escapes backslash', () => {
    expect(typstEscape('back\\slash')).toBe('back\\\\slash')
  })

  it('escapes hash', () => {
    expect(typstEscape('foo#bar')).toBe('foo\\#bar')
  })

  it('escapes dollar sign', () => {
    expect(typstEscape('a$b')).toBe('a\\$b')
  })

  it('escapes double-quote', () => {
    expect(typstEscape('say "hello"')).toBe('say \\"hello\\"')
  })

  it('escapes at-sign', () => {
    expect(typstEscape('user@example.com')).toBe('user\\@example.com')
  })

  it('escapes angle brackets', () => {
    expect(typstEscape('<script>')).toBe('\\<script\\>')
  })

  it('passes through plain safe text unchanged', () => {
    const safe = 'Built reusable UI components with React and TypeScript.'
    expect(typstEscape(safe)).toBe(safe)
  })

  it('handles combined injection attempt', () => {
    const evil = '#let x = "injected" // $hack@<end>'
    const escaped = typstEscape(evil)
    // Every typst-special char must be backslash-prefixed in the output
    expect(escaped).toContain('\\#')    // # escaped
    expect(escaped).toContain('\\"')    // " escaped
    expect(escaped).toContain('\\$')    // $ escaped
    expect(escaped).toContain('\\@')    // @ escaped
    expect(escaped).toContain('\\<')    // < escaped
    expect(escaped).toContain('\\>')    // > escaped
    // The raw unescaped hash sequence must not appear as a leading typst command
    // (i.e. the first char of the escaped result is a backslash, not '#')
    expect(escaped.startsWith('\\')).toBe(true)
  })
})

// ── buildExpectations — variant-aware keyword matching ────────────────────────

describe('buildExpectations — keyword variants match what the resume actually says', () => {
  it('uses alias form "prototypes" in required_keywords when CV says prototypes, not canonical "prototyping"', () => {
    const model = buildResumeModel(CV_WITH_ALIASES)!
    // matchedKeywords contains the CANONICAL label from extractKeywords
    const exp = buildExpectations(model, ['Prototyping'])
    // "Prototyping" is not literally in the resume, but "prototypes" is
    // → required_keywords must contain the alias form, not the canonical label
    expect(exp.required_keywords).not.toContain('prototyping')
    // must contain a form that actually appears in the resume haystack
    const haystack = [model.summary, ...model.work.flatMap((w) => w.highlights), ...model.skills].join(' ').toLowerCase()
    const hasVariant = exp.required_keywords.some((kw) => haystack.includes(kw))
    expect(hasVariant).toBe(true)
  })

  it('drops a term whose canonical and all aliases are absent from the resume', () => {
    const model = buildResumeModel(CV_WITH_ALIASES)!
    // "Docker" appears nowhere in CV_WITH_ALIASES
    const exp = buildExpectations(model, ['Docker'])
    expect(exp.required_keywords).not.toContain('docker')
    expect(exp.required_keywords).toHaveLength(0)
  })

  it('uses alias "cross-functional" when CV says "cross-functional teams"', () => {
    const model = buildResumeModel(CV_WITH_ALIASES)!
    const exp = buildExpectations(model, ['Cross-functional Collaboration'])
    // canonical "cross-functional collaboration" not in resume, but "cross-functional" is
    expect(exp.required_keywords).not.toContain('cross-functional collaboration')
    expect(exp.required_keywords).toContain('cross-functional')
  })

  it('caps required_keywords at 5 AFTER filtering absent terms', () => {
    const model = buildResumeModel(CV_WITH_ALIASES)!
    // Send 8 matched keywords; some may not have variants in the sparse CV
    const kws = ['React', 'TypeScript', 'Prototyping', 'Cross-functional Collaboration', 'Docker', 'Kubernetes', 'AWS', 'Go']
    const exp = buildExpectations(model, kws)
    expect(exp.required_keywords.length).toBeLessThanOrEqual(5)
  })

  it('for terms NOT in the lexicon, includes lowercased literal if present in haystack', () => {
    // A term that is not in LEXICON but literally appears in the CV text
    const modelWithCustomTerm = buildResumeModel(JSON.stringify({
      basics: { name: 'Dev', email: 'd@x.io', summary: 'Expert in superpowered workflows.' },
      work: [],
      skills: [],
      education: [],
    }))!
    // "superpowered" is not in the LEXICON
    const exp = buildExpectations(modelWithCustomTerm, ['Superpowered'])
    // lowercased form literally appears in summary → should be kept
    expect(exp.required_keywords).toContain('superpowered')
  })

  it('for terms NOT in the lexicon, drops them if they do not literally appear in haystack', () => {
    const model = buildResumeModel(CV_WITH_ALIASES)!
    // "Zephyr" is not in LEXICON and not in CV
    const exp = buildExpectations(model, ['Zephyr'])
    expect(exp.required_keywords).toHaveLength(0)
  })
})
