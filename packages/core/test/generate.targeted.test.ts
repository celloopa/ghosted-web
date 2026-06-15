import { describe, it, expect } from 'vitest'
import {
  buildTargetedRevisionPrompt,
  parseTargetedRevision,
  BANNED_PHRASES,
  LETTER_WORD_LIMIT,
  type GenerationInput,
} from '../src/index'

const BASE_INPUT: GenerationInput = {
  company: 'Stripe',
  position: 'Design Engineer',
  descriptionExcerpt: 'Build beautiful, scalable design systems with React and TypeScript.',
  matched: ['React', 'TypeScript'],
  missing: ['GraphQL'],
  cvJson: JSON.stringify({
    basics: { name: 'Cello', summary: 'Designer who codes.' },
    work: [
      {
        name: 'Acme Corp',
        position: 'Design Engineer',
        highlights: ['Built a component library in React/TypeScript', 'Led design system migration'],
      },
    ],
    skills: [{ name: 'React' }, { name: 'TypeScript' }, { name: 'Figma' }],
  }),
  voiceSamples: [],
}

// ── buildTargetedRevisionPrompt ──────────────────────────────────────────────

describe('buildTargetedRevisionPrompt — cover_letter target', () => {
  it('includes the instruction in the prompt', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'Current cover letter text.',
      instruction: 'Make it more specific about Stripe payments.',
    })
    expect(p).toContain('Make it more specific about Stripe payments.')
  })

  it('includes the current text in the prompt', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'Current cover letter text.',
      instruction: 'Tighten the opener.',
    })
    expect(p).toContain('Current cover letter text.')
  })

  it('carries cover_letter word-limit rule', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'A letter.',
      instruction: 'Shorten it.',
    })
    expect(p).toContain(String(LETTER_WORD_LIMIT))
  })

  it('carries banned-phrases rule in the prompt', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'A letter.',
      instruction: 'Punch it up.',
    })
    for (const phrase of BANNED_PHRASES) {
      expect(p.toLowerCase()).toContain(phrase.toLowerCase())
    }
  })

  it('carries transplant test rule', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'A letter.',
      instruction: 'Make it snappier.',
    })
    expect(p.toLowerCase()).toContain('transplant')
  })

  it('carries company + position context', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'A letter.',
      instruction: 'Mention payments.',
    })
    expect(p).toContain('Stripe')
    expect(p).toContain('Design Engineer')
  })

  it('carries CV excerpt', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'A letter.',
      instruction: 'Reference my component library work.',
    })
    expect(p).toContain('Acme Corp')
  })

  it('demands JSON with only cover_letter key in response format', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'A letter.',
      instruction: 'Tighten it.',
    })
    expect(p).toContain('{"cover_letter":"..."}')
  })

  it('instructs model to change NOTHING ELSE', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'cover_letter',
      current: 'A letter.',
      instruction: 'Focus on impact.',
    })
    expect(p.toLowerCase()).toContain('change nothing else')
  })
})

describe('buildTargetedRevisionPrompt — summary target', () => {
  it('carries 40-word limit rule', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'summary',
      current: 'Current summary.',
      instruction: 'Make it punchier.',
    })
    expect(p).toContain('40')
  })

  it('carries truthful-to-CV rule', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'summary',
      current: 'Current summary.',
      instruction: 'Mirror the posting language.',
    })
    expect(p.toLowerCase()).toContain('truthful')
  })

  it('demands JSON with only summary key', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'summary',
      current: 'Current summary.',
      instruction: 'Make it snappier.',
    })
    expect(p).toContain('{"summary":"..."}')
  })

  it('includes the current summary text', () => {
    const p = buildTargetedRevisionPrompt(BASE_INPUT, {
      target: 'summary',
      current: 'Designer who codes at scale.',
      instruction: 'Sharpen it.',
    })
    expect(p).toContain('Designer who codes at scale.')
  })
})

// ── parseTargetedRevision ────────────────────────────────────────────────────

describe('parseTargetedRevision — cover_letter', () => {
  it('parses clean JSON with cover_letter key', () => {
    const r = parseTargetedRevision('{"cover_letter":"Here is my revised letter."}', 'cover_letter')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('Here is my revised letter.')
  })

  it('parses fenced JSON', () => {
    const raw = '```json\n{"cover_letter":"Revised letter inside fence."}\n```'
    const r = parseTargetedRevision(raw, 'cover_letter')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('Revised letter inside fence.')
  })

  it('parses prose-wrapped JSON', () => {
    const raw = 'Sure, here you go:\n{"cover_letter":"Prose-wrapped revised letter."}\nDone.'
    const r = parseTargetedRevision(raw, 'cover_letter')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('Prose-wrapped revised letter.')
  })

  it('returns error on garbage input', () => {
    const r = parseTargetedRevision('I cannot help with that.', 'cover_letter')
    expect(r.ok).toBe(false)
  })

  it('returns error when target key is wrong (summary returned for cover_letter request)', () => {
    const r = parseTargetedRevision('{"summary":"Wrong key."}', 'cover_letter')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('cover_letter')
  })

  it('returns error on invalid JSON', () => {
    const r = parseTargetedRevision('{cover_letter: not valid json}', 'cover_letter')
    expect(r.ok).toBe(false)
  })

  it('trims whitespace from value', () => {
    const r = parseTargetedRevision('{"cover_letter":"  Trimmed.  "}', 'cover_letter')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('Trimmed.')
  })
})

describe('parseTargetedRevision — summary', () => {
  it('parses clean JSON with summary key', () => {
    const r = parseTargetedRevision('{"summary":"Revised one-line summary."}', 'summary')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('Revised one-line summary.')
  })

  it('returns error when cover_letter key returned for summary request', () => {
    const r = parseTargetedRevision('{"cover_letter":"Wrong key for summary."}', 'summary')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('summary')
  })

  it('returns error on empty string value', () => {
    const r = parseTargetedRevision('{"summary":""}', 'summary')
    expect(r.ok).toBe(false)
  })
})
