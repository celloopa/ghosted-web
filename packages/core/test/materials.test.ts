import { describe, it, expect } from 'vitest'
import {
  planResume,
  renderResumeAdjustments,
  buildGenerationPrompt,
  parseGeneration,
  checkCoverLetter,
  type GenerationInput,
} from '../src/index'

const CV = JSON.stringify({
  basics: { name: 'Cello', summary: 'Designer who codes.' },
  work: [
    {
      name: 'Asheville Dispensary',
      position: 'Design Engineer',
      highlights: [
        'Managed Git workflows for a small team',
        'Built a reusable UI component library in React and TypeScript',
        'Implemented a scalable design system in Figma',
      ],
    },
    { name: 'The Green Phial', position: 'Designer', highlights: ['Translated mockups into responsive front-end code'] },
  ],
  skills: [{ name: 'Photoshop' }, { name: 'React' }, { name: 'Figma' }],
})

const KEYWORDS = ['React', 'TypeScript', 'Design Systems', 'Figma', 'Tailwind']

describe('planResume — deterministic bullet ranking (no agent needed)', () => {
  const plan = planResume(CV, KEYWORDS)

  it('reorders bullets so keyword-rich ones lead', () => {
    const role = plan.roles.find((r) => r.name === 'Asheville Dispensary')!
    expect(role.order[0]!.text).toContain('component library') // React + TypeScript hits
    expect(role.order[role.order.length - 1]!.text).toContain('Git workflows') // zero hits
  })

  it('keeps original order as the tiebreak (stable)', () => {
    const role = plan.roles.find((r) => r.name === 'The Green Phial')!
    expect(role.order).toHaveLength(1)
  })

  it('reorders skills: posting-matched first, never invents new ones', () => {
    expect(plan.skills_order[0]).not.toBe('Photoshop')
    expect(plan.skills_order).toContain('Photoshop') // kept, just demoted
    expect(plan.skills_order).toHaveLength(3)
  })

  it('never throws on garbage CV', () => {
    expect(() => planResume('nope', KEYWORDS)).not.toThrow()
  })
})

describe('renderResumeAdjustments — assembled by code, honesty section included', () => {
  it('renders the full markdown doc with a summary slot', () => {
    const plan = planResume(CV, KEYWORDS)
    const doc = renderResumeAdjustments(plan, { summary: 'A rewritten summary.', missing: ['Tailwind'] })
    expect(doc).toContain('## Summary')
    expect(doc).toContain('A rewritten summary.')
    expect(doc).toContain('## Bullet order')
    expect(doc).toContain('component library')
    expect(doc).toContain('## Skills order')
    expect(doc).toMatch(/## What .* not .*change/i)
    expect(doc).toContain('Tailwind') // gaps named, not papered over
  })
})

const INPUT: GenerationInput = {
  company: 'Figma',
  position: 'Design Engineer',
  descriptionExcerpt: 'Build design systems with React.',
  matched: ['React', 'Figma'],
  missing: ['Tailwind'],
  cvJson: CV,
  voiceSamples: ['A past letter I liked.'],
  constraintNotes: 'No visa sponsorship needed.',
}

describe('buildGenerationPrompt — one bounded call, rules embedded', () => {
  const prompt = buildGenerationPrompt(INPUT)

  it('carries the hard rules and demands JSON only', () => {
    for (const want of ['180', 'transplant', 'never invent', 'JSON', 'summary', 'cover_letter', 'resume_rewrites', 'standout_suggestions']) {
      expect(prompt.toLowerCase()).toContain(want.toLowerCase())
    }
  })

  it('includes CV, voice sample, and gaps', () => {
    expect(prompt).toContain('Asheville Dispensary')
    expect(prompt).toContain('A past letter I liked.')
    expect(prompt).toContain('Tailwind')
  })

  it('revision mode includes the current draft and the instruction', () => {
    const p = buildGenerationPrompt(INPUT, {
      current: { summary: 'Old summary', cover_letter: 'Old letter', standout_suggestions: [{ title: 'Proof', action: 'Send a small teardown.', effort: 'medium' }] },
      instruction: 'tighter opener',
    })
    expect(p).toContain('Old letter')
    expect(p).toContain('Send a small teardown')
    expect(p).toContain('tighter opener')
  })
})

describe('parseGeneration — lenient parse + deterministic validation', () => {
  it('parses clean JSON', () => {
    const r = parseGeneration('{"summary":"S","cover_letter":"Short and specific letter.","resume_rewrites":[{"source":"Built UI","rewrite":"Built product UI","why":"Matches role"}],"opportunity_angles":[{"title":"Systems","evidence":"Figma","use":"Resume"}],"standout_suggestions":[{"title":"Teardown","action":"Send a critique","effort":"medium"}]}')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.summary).toBe('S')
      expect(r.resume_rewrites[0]?.rewrite).toBe('Built product UI')
      expect(r.standout_suggestions[0]?.effort).toBe('medium')
    }
  })

  it('parses fenced/prose-wrapped JSON', () => {
    const r = parseGeneration('Here:\n```json\n{"summary":"S","cover_letter":"L"}\n```')
    expect(r.ok).toBe(true)
  })

  it('fails typed on garbage', () => {
    const r = parseGeneration('I cannot do that')
    expect(r.ok).toBe(false)
  })

  it('escaped newlines inside strings survive', () => {
    const r = parseGeneration('{"summary":"S","cover_letter":"Line one.\\n\\nLine two."}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.cover_letter).toContain('Line two.')
  })
})

describe('checkCoverLetter — code validates the agent, not vice versa', () => {
  it('flags banned phrases', () => {
    const { banned } = checkCoverLetter("I'm excited to leverage my skills in a fast-paced environment.")
    expect(banned.length).toBeGreaterThanOrEqual(2)
  })

  it('flags over-length letters', () => {
    const { words, overLimit } = checkCoverLetter('word '.repeat(220))
    expect(words).toBe(220)
    expect(overLimit).toBe(true)
  })

  it('passes a clean, short letter', () => {
    const r = checkCoverLetter('Figma ships small teams. I built a design system at Asheville Dispensary.')
    expect(r.banned).toEqual([])
    expect(r.overLimit).toBe(false)
  })
})
