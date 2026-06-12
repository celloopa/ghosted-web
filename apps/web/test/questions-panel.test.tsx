import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuestionsPanel } from '../components/QuestionsPanel'

const SAMPLE_QA = [
  { question: 'Why do you want to work at Figma?', answer: 'I built a component library at Asheville Dispensary and have been using Figma daily.', added_at: '2026-06-11T10:00:00Z' },
  { question: 'What is your visa status?', answer: 'Eligible to work in the US.', added_at: '2026-06-11T10:01:00Z' },
]

function setup(qaOverride?: typeof SAMPLE_QA) {
  const onDraft = vi.fn()
  const onRevise = vi.fn()
  const onEdit = vi.fn()
  const onRemove = vi.fn()
  const onCopy = vi.fn()
  const onDownloadAll = vi.fn()

  render(
    <QuestionsPanel
      qa={qaOverride ?? SAMPLE_QA}
      busy={false}
      onDraft={onDraft}
      onRevise={onRevise}
      onEdit={onEdit}
      onRemove={onRemove}
      onCopy={onCopy}
      onDownloadAll={onDownloadAll}
    />,
  )
  return { onDraft, onRevise, onEdit, onRemove, onCopy, onDownloadAll }
}

// ---- Draft disabled when input is empty ----

describe('QuestionsPanel — add row', () => {
  it('Draft answer button is disabled when question input is empty', () => {
    setup([])
    const btn = screen.getByRole('button', { name: /Draft answer/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('Draft answer button is enabled when question input has text', async () => {
    setup([])
    const input = screen.getByRole('textbox', { name: /Application form question/i })
    fireEvent.change(input, { target: { value: 'Why this role?' } })
    const btn = screen.getByRole('button', { name: /Draft answer/i })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('onDraft is called with the question text when Draft answer is clicked', async () => {
    const { onDraft } = setup([])
    const input = screen.getByRole('textbox', { name: /Application form question/i })
    fireEvent.change(input, { target: { value: 'Why Figma?' } })
    fireEvent.click(screen.getByRole('button', { name: /Draft answer/i }))
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith('Why Figma?'))
  })

  it('onDraft is called on Enter key in the question input', async () => {
    const { onDraft } = setup([])
    const input = screen.getByRole('textbox', { name: /Application form question/i })
    fireEvent.change(input, { target: { value: 'Tell me about yourself.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith('Tell me about yourself.'))
  })
})

// ---- Card renders ----

describe('QuestionsPanel — card rendering', () => {
  it('renders all Q&A cards', () => {
    setup()
    expect(screen.getByText(SAMPLE_QA[0]!.question)).toBeTruthy()
    expect(screen.getByText(SAMPLE_QA[0]!.answer)).toBeTruthy()
    expect(screen.getByText(SAMPLE_QA[1]!.question)).toBeTruthy()
    expect(screen.getByText(SAMPLE_QA[1]!.answer)).toBeTruthy()
  })

  it('shows empty-state message when qa is empty', () => {
    setup([])
    expect(screen.getByText(/No questions yet/i)).toBeTruthy()
  })
})

// ---- Copy ----

describe('QuestionsPanel — copy action', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it('Copy button calls onCopy with the answer text', async () => {
    const { onCopy } = setup()
    const copyBtns = screen.getAllByRole('button', { name: /Copy answer/i })
    fireEvent.click(copyBtns[0]!)
    await waitFor(() => expect(onCopy).toHaveBeenCalledWith(SAMPLE_QA[0]!.answer))
  })
})

// ---- Edit save ----

describe('QuestionsPanel — edit flow', () => {
  it('Edit button opens a textarea pre-filled with the current answer', async () => {
    setup()
    const editBtns = screen.getAllByRole('button', { name: /Edit answer/i })
    fireEvent.click(editBtns[0]!)
    const textarea = await screen.findByRole('textbox', { name: /Edit answer/i })
    expect((textarea as HTMLTextAreaElement).value).toBe(SAMPLE_QA[0]!.answer)
  })

  it('Saving an edit calls onEdit with the index and new text', async () => {
    const { onEdit } = setup()
    const editBtns = screen.getAllByRole('button', { name: /Edit answer/i })
    fireEvent.click(editBtns[0]!)
    const textarea = await screen.findByRole('textbox', { name: /Edit answer/i })
    fireEvent.change(textarea, { target: { value: 'My custom answer.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(0, 'My custom answer.'))
  })
})

// ---- Download all ----

describe('QuestionsPanel — Download all', () => {
  it('Download all button is disabled when qa is empty', () => {
    setup([])
    const btn = screen.getByRole('button', { name: /Download all/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('Download all button is enabled when qa has items', () => {
    setup()
    const btn = screen.getByRole('button', { name: /Download all/i })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('onDownloadAll is called when Download all is clicked', async () => {
    const { onDownloadAll } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Download all/i }))
    await waitFor(() => expect(onDownloadAll).toHaveBeenCalled())
  })
})
