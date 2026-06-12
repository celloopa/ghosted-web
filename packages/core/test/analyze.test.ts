import { describe, it, expect } from 'vitest'
import { extractKeywords, analyzeFit, keywordVariantIn, emptyBaseline, type PostingFacts } from '../src/index'

const POSTING_TEXT = `We're hiring a Design Engineer. You will build design systems with React,
TypeScript and Figma. Strong CSS and accessibility (WCAG) experience required.
React experience is essential — React, React, React. Tailwind a plus.
You'll collaborate on prototyping and ship production UI.`

const CV = JSON.stringify({
  basics: { name: 'Cello', summary: 'Design engineer.' },
  work: [
    {
      name: 'Asheville Dispensary',
      position: 'Design Engineer',
      highlights: [
        'Built a reusable UI component library in React and TypeScript',
        'Implemented a scalable design system in Figma',
        'Managed Git workflows for the team',
      ],
    },
  ],
  skills: [{ name: 'React' }, { name: 'TypeScript' }, { name: 'Figma' }, { name: 'Go' }],
})

describe('extractKeywords — lexicon-based, deterministic', () => {
  const analysis = extractKeywords(POSTING_TEXT, CV)

  it('finds the real skills, ranked by frequency', () => {
    const terms = analysis.keywords.map((k) => k.term)
    expect(terms).toContain('React')
    expect(terms).toContain('TypeScript')
    expect(terms).toContain('Figma')
    expect(terms).toContain('Design Systems')
    expect(terms).toContain('Accessibility')
    expect(analysis.keywords[0]!.term).toBe('React') // 4 mentions
  })

  it('marks which keywords the CV covers', () => {
    const byTerm = new Map(analysis.keywords.map((k) => [k.term, k]))
    expect(byTerm.get('React')!.inCV).toBe(true)
    expect(byTerm.get('Tailwind')!.inCV).toBe(false)
  })

  it('is case-insensitive and word-bounded', () => {
    const a = extractKeywords('go to the GOLANG meetup. Going strong.')
    const terms = a.keywords.map((k) => k.term)
    expect(terms).toContain('Go') // via golang alias
    // "go to" / "Going" must not count as the Go language
    expect(a.keywords.find((k) => k.term === 'Go')!.count).toBe(1)
  })

  it('returns empty for empty text', () => {
    expect(extractKeywords('').keywords).toEqual([])
  })
})

describe('analyzeFit — deterministic scoring with explanations', () => {
  const facts: PostingFacts = {
    company: 'Figma',
    position: 'Design Engineer',
    remote: true,
    salary_min: 149000,
    salary_max: 188000,
    description: POSTING_TEXT,
  }
  const constraints = {
    ...emptyBaseline().constraints,
    role_types_in: ['design_engineer' as const],
    salary_floor: 130000,
    remote: 'remote_only' as const,
  }

  it('scores a strong match high and guesses the role type from the title', () => {
    const fit = analyzeFit(facts, CV, constraints)
    expect(fit.role_type_guess).toBe('design_engineer')
    expect(fit.score).toBeGreaterThanOrEqual(60)
    expect(fit.matched).toContain('React')
    expect(fit.missing).toContain('Tailwind')
  })

  it('a sparse CV scores lower than a matching CV', () => {
    const sparseCV = JSON.stringify({ basics: { name: 'X' }, work: [], skills: [{ name: 'Photoshop' }] })
    const strong = analyzeFit(facts, CV, constraints)
    const sparse = analyzeFit(facts, sparseCV, constraints)
    expect(sparse.score).toBeLessThan(strong.score)
  })

  it('salary below the floor drags the score and says why', () => {
    const lowball = { ...facts, salary_min: 60000, salary_max: 80000 }
    const fit = analyzeFit(lowball, CV, constraints)
    expect(fit.score).toBeLessThan(analyzeFit(facts, CV, constraints).score)
    expect(fit.notes.join(' ')).toMatch(/salary/i)
  })

  it('role type outside targeting drags the score and says why', () => {
    const offTarget = { ...facts, position: 'Backend Engineer' }
    const fit = analyzeFit(offTarget, CV, constraints)
    expect(fit.role_type_guess).toBe('other')
    expect(fit.score).toBeLessThan(analyzeFit(facts, CV, constraints).score)
    expect(fit.notes.join(' ')).toMatch(/role/i)
  })

  it('on-site posting vs remote-only constraint is flagged', () => {
    const onsite: PostingFacts = { ...facts, remote: false, location: 'New York, NY' }
    const fit = analyzeFit(onsite, CV, constraints)
    expect(fit.notes.join(' ')).toMatch(/remote/i)
  })

  it('never throws on garbage CV', () => {
    expect(() => analyzeFit(facts, 'not json', constraints)).not.toThrow()
  })
})

// ── keywordVariantIn ──────────────────────────────────────────────────────────

describe('keywordVariantIn — alias-first surface-form lookup', () => {
  it('returns the matched alias when CV contains an alias (not the canonical label)', () => {
    // Canonical: "Prototyping", alias order: prototype, prototyping, prototypes
    // "prototypes" is the third alias — we expect whichever alias appears first
    const text = 'We built prototypes of every key interaction.'
    const result = keywordVariantIn(text, 'Prototyping')
    expect(result).not.toBeNull()
    // must be a form actually present in text
    expect(text.toLowerCase()).toContain(result!.toLowerCase())
    // must NOT be the canonical label itself (which is not in the text)
    expect(result).not.toBe('Prototyping')
  })

  it('returns the first alias in alias order when multiple aliases match', () => {
    // Canonical: "Prototyping", aliases: ['prototype', 'prototyping', 'prototypes']
    // "prototyping" appears — that is alias index 1; "prototypes" also appears
    const text = 'built prototyping workflows and saved prototypes for QA'
    const result = keywordVariantIn(text, 'Prototyping')
    // First alias that hits should be "prototype" (alias[0]) — not present here
    // Next is "prototyping" (alias[1]) — present → should win
    expect(result).toBe('prototyping')
  })

  it('returns the canonical display label when its FIRST alias exactly matches it and is in text', () => {
    // Canonical: "Figma", alias: ['figma'] — alias equals the lowercased canonical
    const text = 'We use figma for all design work.'
    const result = keywordVariantIn(text, 'Figma')
    expect(result).toBe('figma')
  })

  it('returns null when no alias matches (term not in text at all)', () => {
    const text = 'We use Sketch for all design work.'
    // "Prototyping" aliases: prototype/prototyping/prototypes — none in text
    const result = keywordVariantIn(text, 'Prototyping')
    expect(result).toBeNull()
  })

  it('returns null when the canonical term is not in the lexicon', () => {
    const result = keywordVariantIn('react typescript figma', 'NonExistentTerm')
    expect(result).toBeNull()
  })

  it('respects word boundaries — partial matches inside longer words do not count', () => {
    // "prototype" must not match inside "prototypescript" (made-up word)
    const text = 'We use prototypescript at scale'
    const result = keywordVariantIn(text, 'Prototyping')
    expect(result).toBeNull()
  })

  it('is case-insensitive in the haystack', () => {
    const text = 'PROTOTYPING is core to our process.'
    const result = keywordVariantIn(text, 'Prototyping')
    expect(result).not.toBeNull()
  })

  it('Cross-functional Collaboration: returns alias present in text, not canonical label', () => {
    // canonical: "Cross-functional Collaboration"
    // aliases: ['cross-functional', 'cross functional']
    const text = 'Worked with cross-functional teams across three time zones.'
    const result = keywordVariantIn(text, 'Cross-functional Collaboration')
    expect(result).toBe('cross-functional')
  })
})
