import { describe, it, expect } from 'vitest'
import {
  INTERVIEW_QUESTIONS,
  buildCVExtractPrompt,
  buildCVInterviewPrompt,
  buildCVVisionPrompt,
  isPoorExtraction,
  parseCVResult,
  cvToView,
  viewToCvJson,
  type CVView,
} from '../src/index'
import { validateCVJson } from '../src/index'

// ---------------------------------------------------------------------------
// Representative fixtures
// ---------------------------------------------------------------------------

const REPRESENTATIVE_VIEW: CVView = {
  name: 'Cello Rondon',
  headline: 'Design Engineer',
  summary: 'I build design systems that scale.',
  contact: {
    email: 'cello@cello.design',
    phone: '+1-828-555-0199',
    location: 'Asheville, NC',
    links: [
      { label: 'GitHub', url: 'https://github.com/celloopa' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/cello' },
    ],
  },
  work: [
    {
      company: 'Asheville Dispensary',
      title: 'Design Engineer',
      start: '2023-01',
      end: 'present',
      highlights: ['Built a design system used by 5 products.', 'Reduced bundle by 40%.'],
    },
    {
      company: 'VegAvengers',
      title: 'Frontend Developer',
      start: '2021-03',
      end: '2023-01',
      highlights: ['Launched React Native app.'],
    },
  ],
  projects: [
    {
      name: 'ghosted',
      description: 'Job tracking CLI',
      url: 'https://github.com/celloopa/ghosted',
      highlights: ['Go, Bubble Tea, Supabase'],
    },
  ],
  skills: ['TypeScript', 'Go', 'Figma', 'React'],
  education: [
    {
      institution: 'UNCA',
      area: 'Computer Science',
      studyType: 'BS',
      year: '2021',
    },
  ],
}

const VALID_CV_JSON = JSON.stringify({
  basics: {
    name: 'Cello Rondon',
    label: 'Design Engineer',
    email: 'cello@cello.design',
    phone: '+1-828-555-0199',
    location: { city: 'Asheville', region: 'NC', countryCode: 'US' },
    summary: 'I build design systems that scale.',
    profiles: [
      { network: 'GitHub', url: 'https://github.com/celloopa' },
      { network: 'LinkedIn', url: 'https://linkedin.com/in/cello' },
    ],
  },
  work: [
    {
      name: 'Asheville Dispensary',
      position: 'Design Engineer',
      startDate: '2023-01',
      endDate: '',
      highlights: ['Built a design system used by 5 products.'],
    },
  ],
  education: [
    { institution: 'UNCA', area: 'Computer Science', studyType: 'BS', endDate: '2021' },
  ],
  skills: [{ name: 'TypeScript' }, { name: 'Go' }, { name: 'Figma' }],
  projects: [
    {
      name: 'ghosted',
      description: 'Job tracking CLI',
      url: 'https://github.com/celloopa/ghosted',
      highlights: ['Go, Bubble Tea, Supabase'],
    },
  ],
})

// ---------------------------------------------------------------------------
// 1. INTERVIEW_QUESTIONS — structural sanity
// ---------------------------------------------------------------------------

describe('INTERVIEW_QUESTIONS structural sanity', () => {
  it('is an array with at least 3 sections', () => {
    expect(Array.isArray(INTERVIEW_QUESTIONS)).toBe(true)
    expect(INTERVIEW_QUESTIONS.length).toBeGreaterThanOrEqual(3)
  })

  it('every section has id, title, and a fields array', () => {
    for (const section of INTERVIEW_QUESTIONS) {
      expect(typeof section.id).toBe('string')
      expect(section.id.length).toBeGreaterThan(0)
      expect(typeof section.title).toBe('string')
      expect(Array.isArray(section.fields)).toBe(true)
      expect(section.fields.length).toBeGreaterThan(0)
    }
  })

  it('has a work section with a repeatable group containing a freeform textarea', () => {
    const work = INTERVIEW_QUESTIONS.find((s) => s.id === 'work')
    expect(work).toBeDefined()
    if (!work) return
    expect(work.repeatable).toBe(true)
    const freeform = work.fields.find((f) => f.kind === 'textarea')
    expect(freeform).toBeDefined()
  })

  it('has a skills section with a list field', () => {
    const skills = INTERVIEW_QUESTIONS.find((s) => s.id === 'skills')
    expect(skills).toBeDefined()
    if (!skills) return
    const listField = skills.fields.find((f) => f.kind === 'list')
    expect(listField).toBeDefined()
  })

  it('has an education section', () => {
    const edu = INTERVIEW_QUESTIONS.find((s) => s.id === 'education')
    expect(edu).toBeDefined()
  })

  it('every field has id, label, and a valid kind', () => {
    const validKinds = new Set(['text', 'textarea', 'list'])
    for (const section of INTERVIEW_QUESTIONS) {
      for (const field of section.fields) {
        expect(typeof field.id).toBe('string')
        expect(typeof field.label).toBe('string')
        expect(validKinds.has(field.kind)).toBe(true)
      }
    }
  })

  it('is fully serializable to JSON and back', () => {
    const json = JSON.stringify(INTERVIEW_QUESTIONS)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual(INTERVIEW_QUESTIONS)
  })
})

// ---------------------------------------------------------------------------
// 2. buildCVExtractPrompt
// ---------------------------------------------------------------------------

describe('buildCVExtractPrompt', () => {
  it('contains the resume text', () => {
    const text = 'Cello Rondon — Senior Engineer at Acme Corp 2020-2023'
    const prompt = buildCVExtractPrompt(text)
    expect(prompt).toContain(text)
  })

  it('has JSON-only envelope instruction (no prose/fences)', () => {
    const prompt = buildCVExtractPrompt('Some resume text')
    expect(prompt.toLowerCase()).toMatch(/only.*json|json.*only|respond.*only.*json|no.*prose|no.*fence/i)
  })

  it('instructs the model never to invent data', () => {
    const prompt = buildCVExtractPrompt('Some resume text')
    expect(prompt.toLowerCase()).toMatch(/never invent|do not invent|extract only|only.*present/i)
  })

  it('describes the JSON Resume shape to emit', () => {
    const prompt = buildCVExtractPrompt('Some resume text')
    expect(prompt).toContain('basics')
    expect(prompt).toContain('work')
    expect(prompt).toContain('skills')
  })

  it('with existingCvJson: includes merge instruction and existing cv', () => {
    const existing = JSON.stringify({ basics: { name: 'Cello' }, work: [] })
    const prompt = buildCVExtractPrompt('new resume text', { existingCvJson: existing })
    expect(prompt).toContain(existing)
    expect(prompt.toLowerCase()).toMatch(/merge|prefer.*existing|existing.*non-empty/i)
  })
})

// ---------------------------------------------------------------------------
// 3. buildCVInterviewPrompt
// ---------------------------------------------------------------------------

describe('buildCVInterviewPrompt', () => {
  const answers = {
    basics: { name: 'Cello Rondon', email: 'cello@cello.design', location: 'Asheville, NC' },
    work: [{ company: 'Acme', title: 'Engineer', start: '2020', end: '2023', whatDidYouDo: 'Built APIs using Go and PostgreSQL.' }],
    skills: ['Go', 'TypeScript'],
  }

  it('embeds the answers as JSON', () => {
    const prompt = buildCVInterviewPrompt(answers)
    expect(prompt).toContain('Cello Rondon')
  })

  it('instructs the model to turn freeform text into resume bullets using only stated facts', () => {
    const prompt = buildCVInterviewPrompt(answers)
    expect(prompt.toLowerCase()).toMatch(/bullet|highlights/i)
    expect(prompt.toLowerCase()).toMatch(/only.*facts|never invent|stated/i)
  })

  it('has JSON-only envelope instruction', () => {
    const prompt = buildCVInterviewPrompt(answers)
    expect(prompt.toLowerCase()).toMatch(/only.*json|json.*only|respond.*only/i)
  })

  it('instructs the model not to invent metrics or tools not in the answers', () => {
    const prompt = buildCVInterviewPrompt(answers)
    expect(prompt.toLowerCase()).toMatch(/never invent|do not invent/i)
  })
})

// ---------------------------------------------------------------------------
// 4. parseCVResult
// ---------------------------------------------------------------------------

describe('parseCVResult', () => {
  it('parses a clean JSON Resume string and returns ok + summary', () => {
    const r = parseCVResult(VALID_CV_JSON)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.summary.name).toBe('Cello Rondon')
      expect(typeof r.cvJson).toBe('string')
      // Must be valid JSON
      expect(() => JSON.parse(r.cvJson)).not.toThrow()
    }
  })

  it('parses when JSON is fenced in markdown code block', () => {
    const fenced = '```json\n' + VALID_CV_JSON + '\n```'
    const r = parseCVResult(fenced)
    expect(r.ok).toBe(true)
  })

  it('parses when JSON is wrapped in prose', () => {
    const wrapped = 'Sure! Here is the JSON Resume:\n\n' + VALID_CV_JSON + '\n\nLet me know if you need changes.'
    const r = parseCVResult(wrapped)
    expect(r.ok).toBe(true)
  })

  it('returns error for pure garbage input', () => {
    const r = parseCVResult('not json at all blah blah blah')
    expect(r.ok).toBe(false)
  })

  it('returns error for valid JSON that has no basics.name', () => {
    const noName = JSON.stringify({ basics: { email: 'x@x.com' }, work: [] })
    const r = parseCVResult(noName)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/name/i)
  })

  it('never throws on any input', () => {
    for (const weird of ['', '{}', 'null', '[]', '{"basics":null}', '\x00\x01\x02']) {
      expect(() => parseCVResult(weird)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// 5. cvToView
// ---------------------------------------------------------------------------

describe('cvToView', () => {
  it('maps a full JSON Resume to CVView correctly', () => {
    const view = cvToView(VALID_CV_JSON)
    expect(view).not.toBeNull()
    if (!view) return
    expect(view.name).toBe('Cello Rondon')
    expect(view.contact.email).toBe('cello@cello.design')
    expect(view.contact.links).toHaveLength(2)
    expect(view.contact.links[0]).toEqual({ label: 'GitHub', url: 'https://github.com/celloopa' })
    expect(view.skills).toContain('TypeScript')
    expect(view.skills).toContain('Go')
    expect(view.work).toHaveLength(1)
    expect(view.work[0]!.company).toBe('Asheville Dispensary')
    expect(view.education).toHaveLength(1)
    expect(view.education[0]!.institution).toBe('UNCA')
    expect(view.projects).toHaveLength(1)
  })

  it('flattens location to "City, Region" string', () => {
    const view = cvToView(VALID_CV_JSON)
    expect(view?.contact.location).toMatch(/Asheville/)
    expect(view?.contact.location).toMatch(/NC/)
  })

  it('returns null for unparseable JSON', () => {
    expect(cvToView('not json')).toBeNull()
  })

  it('returns null when basics.name is missing', () => {
    expect(cvToView('{"basics":{"email":"x@x.com"}}')).toBeNull()
  })

  it('tolerates missing sections — returns empty arrays, not errors', () => {
    const minimal = JSON.stringify({ basics: { name: 'X' } })
    const view = cvToView(minimal)
    expect(view).not.toBeNull()
    if (!view) return
    expect(view.work).toEqual([])
    expect(view.skills).toEqual([])
    expect(view.education).toEqual([])
    expect(view.projects).toEqual([])
    expect(view.contact.links).toEqual([])
  })

  it('falls back to url hostname when profile has no network label', () => {
    const cv = JSON.stringify({
      basics: {
        name: 'X',
        profiles: [{ url: 'https://portfolio.example.com' }],
      },
    })
    const view = cvToView(cv)
    expect(view?.contact.links[0]?.label).toBe('portfolio.example.com')
  })
})

// ---------------------------------------------------------------------------
// 6. viewToCvJson
// ---------------------------------------------------------------------------

describe('viewToCvJson', () => {
  it('produces a JSON string that passes validateCVJson', () => {
    const json = viewToCvJson(REPRESENTATIVE_VIEW)
    const result = validateCVJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary.name).toBe('Cello Rondon')
    }
  })

  it('serializes skills as [{name}] array', () => {
    const json = viewToCvJson(REPRESENTATIVE_VIEW)
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed.skills)).toBe(true)
    expect(parsed.skills[0]).toHaveProperty('name')
  })

  it('serializes contact.links as profiles with network and url', () => {
    const json = viewToCvJson(REPRESENTATIVE_VIEW)
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed.basics.profiles)).toBe(true)
    expect(parsed.basics.profiles[0]).toHaveProperty('network', 'GitHub')
    expect(parsed.basics.profiles[0]).toHaveProperty('url', 'https://github.com/celloopa')
  })

  it('round-trip: cvToView(viewToCvJson(view)) deep-equals the input (modulo normalization)', () => {
    const json = viewToCvJson(REPRESENTATIVE_VIEW)
    const back = cvToView(json)
    expect(back).not.toBeNull()
    if (!back) return
    expect(back.name).toBe(REPRESENTATIVE_VIEW.name)
    expect(back.contact.email).toBe(REPRESENTATIVE_VIEW.contact.email)
    expect(back.skills).toEqual(REPRESENTATIVE_VIEW.skills)
    expect(back.work).toHaveLength(REPRESENTATIVE_VIEW.work.length)
    expect(back.work[0]!.company).toBe(REPRESENTATIVE_VIEW.work[0]!.company)
    expect(back.work[0]!.highlights).toEqual(REPRESENTATIVE_VIEW.work[0]!.highlights)
    expect(back.education[0]!.institution).toBe(REPRESENTATIVE_VIEW.education[0]!.institution)
    expect(back.contact.links).toHaveLength(REPRESENTATIVE_VIEW.contact.links.length)
  })

  it('JSON Resume → cvToView → viewToCvJson → validateCVJson passes, name/work/skills survive', () => {
    const view = cvToView(VALID_CV_JSON)
    expect(view).not.toBeNull()
    if (!view) return
    const json = viewToCvJson(view)
    const validation = validateCVJson(json)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.summary.name).toBe('Cello Rondon')
    expect(validation.summary.workCount).toBeGreaterThan(0)
    expect(validation.summary.skillCount).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 7. isPoorExtraction
// ---------------------------------------------------------------------------

describe('isPoorExtraction', () => {
  it('empty string → true', () => {
    expect(isPoorExtraction('', 1)).toBe(true)
  })

  it('whitespace-only string → true', () => {
    expect(isPoorExtraction('   \n\t  ', 1)).toBe(true)
  })

  it('tiny text (< 200 chars) → true regardless of page count', () => {
    // 50 chars, 1 page
    expect(isPoorExtraction('Jane Smith Senior Engineer Acme Corp 2020 2023 Go', 1)).toBe(true)
  })

  it('exactly 199 trimmed chars → true', () => {
    const text = 'a'.repeat(199)
    expect(isPoorExtraction(text, 1)).toBe(true)
  })

  it('exactly 200 trimmed chars, 1 page → false (chars/page = 200 ≥ 120)', () => {
    const text = 'a'.repeat(200)
    expect(isPoorExtraction(text, 1)).toBe(false)
  })

  it('healthy 2-page résumé text → false', () => {
    // Real résumé extract: well over 200 chars, and (chars/pages) > 120
    const twoPageText = `
      Jane Smith
      Senior Software Engineer | jane@example.com | +1 555 000 1234 | San Francisco, CA
      GitHub: github.com/janesmith | LinkedIn: linkedin.com/in/janesmith

      Experience
      Acme Corp — Senior Engineer (2020–2023)
      • Led migration of monolith to microservices, reducing deployment time by 60%
      • Mentored team of 4 engineers
      • Owned Stripe payments integration serving 50k users

      Startup XYZ — Engineer (2017–2020)
      • Built real-time dashboard in React and Go
      • Reduced p99 latency from 2 s to 180 ms through query optimisation

      Skills: Go, TypeScript, React, PostgreSQL, Kubernetes, Docker, Terraform

      Education
      University of California, Berkeley — BS Computer Science, 2017
    `.repeat(2)
    expect(isPoorExtraction(twoPageText, 2)).toBe(false)
  })

  it('1-page text of exactly 150 chars → true (< 200 threshold)', () => {
    const text = 'b'.repeat(150)
    expect(isPoorExtraction(text, 1)).toBe(true)
  })

  it('text ≥ 200 chars but thin per-page (chars/page < 120) → true', () => {
    // 240 chars across 3 pages → 80 chars/page < 120
    const text = 'x'.repeat(240)
    expect(isPoorExtraction(text, 3)).toBe(true)
  })

  it('text ≥ 200 chars, chars/page exactly 120 → false (at threshold = ok)', () => {
    // 360 chars across 3 pages → exactly 120 chars/page
    const text = 'x'.repeat(360)
    expect(isPoorExtraction(text, 3)).toBe(false)
  })

  it('whitespace is normalised before length check', () => {
    // 300 chars of 'a' separated by many spaces → trimmed length still counts
    const text = '  ' + 'a'.repeat(198) + '  '
    // trimmed = 198 chars → < 200 → true
    expect(isPoorExtraction(text, 1)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 8. buildCVVisionPrompt
// ---------------------------------------------------------------------------

describe('buildCVVisionPrompt', () => {
  it('contains the never-invent rule', () => {
    const prompt = buildCVVisionPrompt()
    expect(prompt.toLowerCase()).toMatch(/never invent|do not invent/i)
  })

  it('contains the JSON-only envelope', () => {
    const prompt = buildCVVisionPrompt()
    expect(prompt.toLowerCase()).toMatch(/respond with only|only.*json|no prose|no code fence/i)
  })

  it('describes the JSON Resume shape keys: basics, work, skills, education', () => {
    const prompt = buildCVVisionPrompt()
    expect(prompt).toContain('basics')
    expect(prompt).toContain('work')
    expect(prompt).toContain('skills')
    expect(prompt).toContain('education')
  })

  it('mentions images / pages of the résumé (since images are attached by caller)', () => {
    const prompt = buildCVVisionPrompt()
    expect(prompt.toLowerCase()).toMatch(/image|page/i)
  })

  it('instructs to omit ambiguous/unreadable text rather than guess', () => {
    const prompt = buildCVVisionPrompt()
    expect(prompt.toLowerCase()).toMatch(/omit|unreadable|ambiguous/i)
  })

  it('without existingCvJson: does NOT contain a merge instruction', () => {
    const prompt = buildCVVisionPrompt()
    expect(prompt.toLowerCase()).not.toMatch(/merge into|merging into/i)
  })

  it('with existingCvJson: includes merge instruction and the existing JSON', () => {
    const existing = JSON.stringify({ basics: { name: 'Cello' }, work: [] })
    const prompt = buildCVVisionPrompt({ existingCvJson: existing })
    expect(prompt).toContain(existing)
    expect(prompt.toLowerCase()).toMatch(/merge|existing.*json|prefer.*existing/i)
  })

  it('with pageCount: mentions the count in the prompt', () => {
    const prompt = buildCVVisionPrompt({ pageCount: 3 })
    expect(prompt).toContain('3')
  })
})
