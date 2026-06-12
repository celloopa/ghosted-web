import { describe, it, expect } from 'vitest'
import {
  buildAnswerPrompt,
  parseAnswer,
  checkAnswer,
  renderQuestionsDoc,
  ANSWER_WORD_LIMIT,
  type AnswerInput,
} from '../src/index'

const CV = JSON.stringify({
  basics: { name: 'Cello', summary: 'Designer who codes.' },
  work: [
    {
      name: 'Asheville Dispensary',
      position: 'Design Engineer',
      highlights: ['Built a reusable UI component library in React and TypeScript'],
    },
  ],
  skills: [{ name: 'React' }, { name: 'Figma' }],
})

const INPUT: AnswerInput = {
  company: 'Figma',
  position: 'Design Engineer',
  descriptionExcerpt: 'Build design systems with React.',
  cvJson: CV,
  voiceSamples: ['A past letter sample.'],
  constraintNotes: 'Eligible to work in the US. Salary floor $160k.',
}

// ---- buildAnswerPrompt ----

describe('buildAnswerPrompt — rules and structure', () => {
  it('embeds the question in the prompt', () => {
    const p = buildAnswerPrompt(INPUT, 'Why do you want to work at Figma?')
    expect(p).toContain('Why do you want to work at Figma?')
  })

  it('embeds company and position', () => {
    const p = buildAnswerPrompt(INPUT, 'Why Figma?')
    expect(p).toContain('Figma')
    expect(p).toContain('Design Engineer')
  })

  it('carries the word limit rule', () => {
    const p = buildAnswerPrompt(INPUT, 'Tell me about yourself.')
    expect(p).toContain(String(ANSWER_WORD_LIMIT))
  })

  it('carries the never-invent rule', () => {
    const p = buildAnswerPrompt(INPUT, 'Describe a challenging project.')
    expect(p.toLowerCase()).toContain('never invent')
  })

  it('carries the banned-phrases rule', () => {
    const p = buildAnswerPrompt(INPUT, 'Why this role?')
    expect(p).toContain('passionate about')
  })

  it('carries the JSON-only instruction', () => {
    const p = buildAnswerPrompt(INPUT, 'Salary expectations?')
    expect(p).toContain('{"answer":"..."}')
  })

  it('carries constraintNotes for factual questions', () => {
    const p = buildAnswerPrompt(INPUT, 'What is your visa status?')
    expect(p).toContain('Eligible to work in the US')
  })

  it('includes the voice sample', () => {
    const p = buildAnswerPrompt(INPUT, 'Anything else?')
    expect(p).toContain('A past letter sample.')
  })

  it('revision mode includes current answer and instruction', () => {
    const p = buildAnswerPrompt(INPUT, 'Why Figma?', {
      current: 'Because it is a great product.',
      instruction: 'Be more specific about my work.',
    })
    expect(p).toContain('Because it is a great product.')
    expect(p).toContain('Be more specific about my work.')
    expect(p).toContain('REVISION')
  })

  it('no voice samples — falls back to plain-voice instruction', () => {
    const noVoice: AnswerInput = { ...INPUT, voiceSamples: [] }
    const p = buildAnswerPrompt(noVoice, 'Why this role?')
    expect(p).toContain('No voice samples')
  })
})

// ---- parseAnswer ----

describe('parseAnswer — lenient parse', () => {
  it('parses clean JSON', () => {
    const r = parseAnswer('{"answer":"I built a design system at Asheville Dispensary."}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer).toBe('I built a design system at Asheville Dispensary.')
  })

  it('parses fenced/prose-wrapped JSON', () => {
    const r = parseAnswer('Here is my answer:\n```json\n{"answer":"My answer here."}\n```')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer).toBe('My answer here.')
  })

  it('fails on garbage — no JSON object', () => {
    const r = parseAnswer('I cannot do that')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('no JSON object')
  })

  it('fails on invalid JSON inside braces', () => {
    const r = parseAnswer('{not valid json}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('not valid JSON')
  })

  it('fails when answer field is missing', () => {
    const r = parseAnswer('{"result":"ok"}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('missing answer')
  })

  it('trims whitespace from the answer', () => {
    const r = parseAnswer('{"answer":"  Hello world.  "}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.answer).toBe('Hello world.')
  })
})

// ---- checkAnswer ----

describe('checkAnswer — word count and banned phrases', () => {
  it('flags over-limit answers', () => {
    const { words, overLimit } = checkAnswer('word '.repeat(200))
    expect(words).toBe(200)
    expect(overLimit).toBe(true)
  })

  it('does not flag answers at the limit', () => {
    const { overLimit } = checkAnswer('word '.repeat(ANSWER_WORD_LIMIT))
    expect(overLimit).toBe(false)
  })

  it('does not flag answers in the grace range', () => {
    // 165 words (limit 150 + grace 25 = 175 allowed)
    const { overLimit } = checkAnswer('word '.repeat(165))
    expect(overLimit).toBe(false)
  })

  it('flags banned phrases', () => {
    const { banned } = checkAnswer("I'm excited to leverage my skills at Figma.")
    expect(banned.length).toBeGreaterThanOrEqual(2)
  })

  it('passes a clean short answer', () => {
    const r = checkAnswer('I built a component library in React at Asheville Dispensary.')
    expect(r.banned).toEqual([])
    expect(r.overLimit).toBe(false)
    expect(r.words).toBe(10)
  })

  it('counts words correctly for empty string', () => {
    const { words } = checkAnswer('')
    expect(words).toBe(0)
  })
})

// ---- renderQuestionsDoc ----

describe('renderQuestionsDoc — markdown shape', () => {
  it('renders H1 with company and position', () => {
    const doc = renderQuestionsDoc('Figma', 'Design Engineer', [])
    expect(doc).toContain('# Application questions — Figma, Design Engineer')
  })

  it('renders each question as H2 with its answer', () => {
    const qa = [
      { question: 'Why Figma?', answer: 'Because of the craft.' },
      { question: 'Visa status?', answer: 'Eligible to work in the US.' },
    ]
    const doc = renderQuestionsDoc('Figma', 'Design Engineer', qa)
    expect(doc).toContain('## Why Figma?')
    expect(doc).toContain('Because of the craft.')
    expect(doc).toContain('## Visa status?')
    expect(doc).toContain('Eligible to work in the US.')
  })

  it('renders an empty doc without error when qa is empty', () => {
    const doc = renderQuestionsDoc('Figma', 'Design Engineer', [])
    expect(doc).toContain('# Application questions')
    // No H2 headings
    expect(doc).not.toContain('##')
  })

  it('renders multiple items in order', () => {
    const qa = [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
      { question: 'Q3', answer: 'A3' },
    ]
    const doc = renderQuestionsDoc('Stripe', 'Software Engineer', qa)
    const q1pos = doc.indexOf('Q1')
    const q2pos = doc.indexOf('Q2')
    const q3pos = doc.indexOf('Q3')
    expect(q1pos).toBeLessThan(q2pos)
    expect(q2pos).toBeLessThan(q3pos)
  })
})
