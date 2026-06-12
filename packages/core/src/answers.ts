// Bounded answer generation for application-form questions.
// Mirrors the discipline of generate.ts: code builds the prompt, code parses,
// code validates. The model answers only what the CV can support.

import { BANNED_PHRASES } from './generate'

export const ANSWER_WORD_LIMIT = 150
const ANSWER_WORD_GRACE = 25

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

export interface AnswerInput {
  company: string
  position: string
  descriptionExcerpt: string
  cvJson: string
  voiceSamples: string[]
  constraintNotes?: string
}

export interface AnswerRevision {
  current: string
  instruction: string
}

/**
 * Build the bounded prompt for answering one application-form question.
 * Rules are embedded so the model cannot ignore them:
 * - Answer THIS question for THIS application.
 * - ≤150 words unless the question explicitly demands more.
 * - Include one concrete CV evidence reference.
 * - Never invent roles, dates, tools, metrics, or facts not in the CV.
 * - Visa/salary/factual blanks: answer from constraintNotes if present,
 *   else say the candidate should fill in the factual detail — never guess.
 * - Banned phrases apply.
 * - Respond ONLY JSON: {"answer":"..."}
 */
export function buildAnswerPrompt(
  input: AnswerInput,
  question: string,
  revision?: AnswerRevision,
): string {
  const voice =
    input.voiceSamples.length > 0
      ? `Match the register of these past letters the candidate would send again:\n${input.voiceSamples
          .map((v, i) => `--- sample ${i + 1} ---\n${clip(v, 1500)}`)
          .join('\n')}`
      : 'No voice samples — write plainly and specifically; correct beats colorful.'

  const revisionBlock = revision
    ? `\nThis is a REVISION of an existing answer.\nCurrent answer: ${revision.current}\n\nRevision instruction from the candidate: ${revision.instruction}\nApply the instruction; keep what works.\n`
    : ''

  return `You are helping a designer who codes answer a specific question on a job application form.

Job: ${input.position} at ${input.company}
Posting context:
${clip(input.descriptionExcerpt, 3000)}

Candidate CV (JSON Resume — the single source of truth, never invent beyond it):
${clip(input.cvJson, 10000)}

${input.constraintNotes ? `Candidate notes (visa status, salary, constraints — use these for factual questions): ${input.constraintNotes}` : ''}
${voice}
${revisionBlock}
Question to answer:
${question}

Hard rules:
- Answer ONLY the question above. Do not pad with unrelated context.
- Word limit: ${ANSWER_WORD_LIMIT} words. Count before answering; cut until under. Only exceed this limit if the question itself explicitly asks for a detailed explanation.
- Include exactly one concrete, verifiable fact from the candidate's CV (a project, role, tool, or outcome that is present in the CV).
- Never invent roles, dates, employers, metrics, tools, case studies, or facts not present in the CV.
- Visa / salary / factual personal questions: if the answer is in the candidate notes above, use it. If not, write a short answer that states the candidate should fill in the specific factual detail — do not guess or fabricate.
- Banned phrases (do not use any of these): ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')}.
- Do not use filler phrases like "great question" or "I would love to".
- Transplant test: if this answer would make sense sent to a different company, rewrite it to be specific before answering.

Respond with ONLY a JSON object, no code fences, no prose:
{"answer":"..."}`
}

export type AnswerResult =
  | { ok: true; answer: string }
  | { ok: false; error: string }

/** Lenient parse — strips prose/fences, extracts first JSON object. */
export function parseAnswer(raw: string): AnswerResult {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object in model response' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch (e) {
    return { ok: false, error: `model response was not valid JSON: ${(e as Error).message}` }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'unexpected response shape' }
  const rec = parsed as Record<string, unknown>
  const answer = rec['answer']
  if (typeof answer !== 'string' || !answer.trim()) return { ok: false, error: 'response missing answer field' }
  return { ok: true, answer: answer.trim() }
}

export interface AnswerCheck {
  words: number
  overLimit: boolean
  banned: string[]
}

/** Deterministic validation of the model's answer — code checks the agent. */
export function checkAnswer(answer: string): AnswerCheck {
  const words = answer.trim() === '' ? 0 : answer.trim().split(/\s+/).length
  const lower = answer.toLowerCase().replace(/['']/g, "'")
  const banned = BANNED_PHRASES.filter((p) => lower.includes(p))
  return { words, overLimit: words > ANSWER_WORD_LIMIT + ANSWER_WORD_GRACE, banned }
}

/** Render all Q&A pairs as a markdown document for download. */
export function renderQuestionsDoc(
  company: string,
  position: string,
  qa: { question: string; answer: string }[],
): string {
  const lines: string[] = [`# Application questions — ${company}, ${position}`, '']
  for (const item of qa) {
    lines.push(`## ${item.question}`, '', item.answer, '')
  }
  return lines.join('\n')
}
