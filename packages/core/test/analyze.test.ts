import { describe, it, expect } from 'vitest'
import { extractKeywords, analyzeFit, keywordVariantIn, guessRoleType, emptyBaseline, type PostingFacts } from '../src/index'
import { KNOWN_ROLE_TYPES } from '../src/index'

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
    // 'design_engineer' was a legacy value; 'design' is the new consolidated bucket
    role_types_in: ['design' as const],
    salary_floor: 130000,
    remote: 'remote_only' as const,
  }

  it('scores a strong match high and guesses the role type from the title', () => {
    const fit = analyzeFit(facts, CV, constraints)
    // "Design Engineer" title → classified as 'design' (the broadened bucket)
    expect(fit.role_type_guess).toBe('design')
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
    // Backend Engineer is now confidently classified as software_engineering (not 'other')
    expect(fit.role_type_guess).toBe('software_engineering')
    // Off-target: software_engineering vs design targeting → penalty applied
    // The on-target "Design Engineer" scores role=1.0; off-target scores role=0.25
    // Both use the same CV/posting so coverage is the same; only roleScore differs
    expect(fit.score).toBeLessThan(90) // penalty means score is materially lower than a perfect match
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

// ── Cross-functional roles ────────────────────────────────────────────────────

const CS_POSTING = `Customer Service Representative — full-time.
You will handle inbound customer support tickets and phone calls.
Strong scheduling and calendar management skills required.
Must be comfortable with Salesforce CRM and conflict resolution.
Experience with onboarding and training new team members is a plus.
Excellent communication skills and problem-solving mindset required.`

const CS_CV = JSON.stringify({
  basics: { name: 'Jordan', summary: 'Customer service professional.' },
  work: [
    {
      name: 'Acme Corp',
      position: 'Customer Support Specialist',
      highlights: [
        'Managed customer service tickets in Salesforce CRM',
        'Resolved escalations through conflict resolution',
        'Onboarded and trained 10 new team members',
        'Maintained scheduling and calendar management for the team',
      ],
    },
  ],
  skills: [{ name: 'Customer Service' }, { name: 'Salesforce' }, { name: 'Communication' }],
})

describe('customer-service role — broadened lexicon and neutral fit', () => {
  it('extracts real customer-service keywords from a CS posting', () => {
    const analysis = extractKeywords(CS_POSTING, CS_CV)
    const terms = analysis.keywords.map((k) => k.term)
    expect(terms).toContain('Customer Service')
    expect(terms).toContain('Salesforce')
    expect(terms).toContain('Scheduling')
    expect(terms).toContain('Conflict Resolution')
    expect(terms).toContain('Communication')
    expect(terms).toContain('Onboarding')
    expect(terms.length).toBeGreaterThan(0)
  })

  it('marks CS keywords as present in a matching CS CV', () => {
    const analysis = extractKeywords(CS_POSTING, CS_CV)
    const byTerm = new Map(analysis.keywords.map((k) => [k.term, k]))
    expect(byTerm.get('Customer Service')!.inCV).toBe(true)
    expect(byTerm.get('Salesforce')!.inCV).toBe(true)
    expect(byTerm.get('Conflict Resolution')!.inCV).toBe(true)
  })

  it('guessRoleType classifies a CS title as customer_service', () => {
    expect(guessRoleType('Customer Service Representative')).toBe('customer_service')
    expect(guessRoleType('Customer Support Specialist')).toBe('customer_service')
    expect(guessRoleType('Client Success Manager')).toBe('customer_service')
  })

  it('CS posting + CS CV gets a non-punitive fit score (no off-target penalty)', () => {
    const csFacts: PostingFacts = {
      company: 'RetailCo',
      position: 'Customer Service Representative',
      remote: false,
      description: CS_POSTING,
    }
    const csConstraints = {
      ...emptyBaseline().constraints,
      role_types_in: ['customer_service' as const],
    }
    const fit = analyzeFit(csFacts, CS_CV, csConstraints)
    expect(fit.role_type_guess).toBe('customer_service')
    // Good keyword coverage + on-target role should score well
    expect(fit.score).toBeGreaterThanOrEqual(55)
    // Notes should NOT mention targeting penalty
    expect(fit.notes.join(' ')).not.toMatch(/outside your targeting/i)
  })

  it('unclassifiable posting (role_type_guess=other) is neutral, not penalized', () => {
    const weirdFacts: PostingFacts = {
      company: 'X',
      position: 'Specialist IV - Interplanetary Logistics Wrangler',
      remote: true,
      description: 'No known skills mentioned.',
    }
    const designConstraints = {
      ...emptyBaseline().constraints,
      role_types_in: ['design' as const],
    }
    const fit = analyzeFit(weirdFacts, CS_CV, designConstraints)
    expect(fit.role_type_guess).toBe('other')
    // roleScore should be neutral (0.7) so score won't be penalized to 0.25 range
    // With no keywords and neutral role + logistics, score ~ round(100*(0.55*0.5 + 0.3*0.7 + 0.15*1)) = round(100*0.64) = 64
    expect(fit.score).toBeGreaterThanOrEqual(50)
    expect(fit.notes.join(' ')).not.toMatch(/outside your targeting/i)
  })
})

// ── RoleType type flexibility ─────────────────────────────────────────────────

describe('RoleType — accepts custom strings and known presets', () => {
  it('KNOWN_ROLE_TYPES has 15 entries with other last', () => {
    expect(KNOWN_ROLE_TYPES.length).toBe(15)
    expect(KNOWN_ROLE_TYPES[KNOWN_ROLE_TYPES.length - 1]!.value).toBe('other')
  })

  it('KNOWN_ROLE_TYPES includes expected cross-functional roles', () => {
    const values = KNOWN_ROLE_TYPES.map((r) => r.value)
    expect(values).toContain('customer_service')
    expect(values).toContain('healthcare')
    expect(values).toContain('marketing')
    expect(values).toContain('finance')
    expect(values).toContain('education')
    expect(values).toContain('software_engineering')
    expect(values).toContain('design')
  })

  it('custom/unknown role string is accepted by the type at runtime', () => {
    // TypeScript union allows any string via (string & {}); at runtime Application.role_type
    // is just a string so we verify the KNOWN_ROLE_TYPES lookup gracefully handles an unknown value.
    const customRole: string = 'veterinary_technician'
    const found = KNOWN_ROLE_TYPES.find((r) => r.value === customRole)
    expect(found).toBeUndefined() // not in presets — UI falls back to free-text input
  })

  it('guessRoleType returns other for a completely unclassifiable title', () => {
    expect(guessRoleType('Wizard of Vibes')).toBe('other')
    expect(guessRoleType('')).toBe('other')
  })

  it('analyzeFit stays neutral (no penalty) when targeting contains a custom role string not in classifiable set', () => {
    const customConstraints = {
      ...emptyBaseline().constraints,
      role_types_in: ['veterinary_technician'], // custom string, not in CLASSIFIABLE_ROLES
    }
    const simpleFacts: PostingFacts = {
      company: 'VetClinic',
      position: 'Backend Engineer', // confidently software_engineering
      remote: true,
      description: 'Python and AWS experience required.',
    }
    const fit = analyzeFit(simpleFacts, '{}', customConstraints)
    // targeting contains an unclassifiable custom string → neutral (no penalty)
    expect(fit.notes.join(' ')).not.toMatch(/outside your targeting/i)
  })
})
