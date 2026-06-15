import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CVInterview } from '../components/CVInterview'
import { buildCVInterviewPrompt, parseCVResult, cvToView, type CVView } from '@ghosted/core'

// A minimal valid JSON Resume response the mock model returns
const MOCK_CV_JSON = JSON.stringify({
  basics: {
    name: 'Jane Smith',
    email: 'jane@example.com',
    location: { city: 'Asheville', region: 'NC' },
  },
  work: [
    {
      name: 'Acme Corp',
      position: 'Engineer',
      startDate: '2020-01',
      highlights: ['Built the platform.'],
    },
  ],
  skills: [{ name: 'TypeScript' }],
})

describe('CVInterview', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('renders questions from INTERVIEW_QUESTIONS (basics section visible)', () => {
    render(
      <CVInterview
        onReview={vi.fn()}
        callModel={vi.fn()}
        busy={false}
        setBusy={vi.fn()}
      />,
    )
    expect(screen.getByText('About you')).toBeTruthy()
    expect(screen.getByPlaceholderText('Jane Smith')).toBeTruthy()
    expect(screen.getByText('Work experience')).toBeTruthy()
    // "Skills" appears as section title and as field label — use getAllByText
    expect(screen.getAllByText('Skills').length).toBeGreaterThanOrEqual(1)
  })

  it('filling in a name and clicking build passes a prompt containing the answer to callModel', async () => {
    const callModel = vi.fn().mockResolvedValue(MOCK_CV_JSON)
    const onReview = vi.fn()
    const setBusy = vi.fn()

    render(
      <CVInterview
        onReview={onReview}
        callModel={callModel}
        busy={false}
        setBusy={setBusy}
      />,
    )

    // Fill in name
    fireEvent.change(screen.getByPlaceholderText('Jane Smith'), {
      target: { value: 'Jane Smith' },
    })

    // Fill in email
    fireEvent.change(screen.getByPlaceholderText('jane@example.com'), {
      target: { value: 'jane@example.com' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Build my CV' }))

    await waitFor(() => expect(callModel).toHaveBeenCalledOnce())

    const prompt = callModel.mock.calls[0][0] as string
    // The prompt should contain the name the user typed
    expect(prompt).toContain('Jane Smith')
    // Should be a CV interview prompt (contains interview instructions)
    expect(prompt).toContain('Interview answers')
  })

  it('on successful build calls onReview with a CVView', async () => {
    const callModel = vi.fn().mockResolvedValue(MOCK_CV_JSON)
    const onReview = vi.fn()

    render(
      <CVInterview
        onReview={onReview}
        callModel={callModel}
        busy={false}
        setBusy={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Jane Smith'), {
      target: { value: 'Jane Smith' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Build my CV' }))

    await waitFor(() => expect(onReview).toHaveBeenCalledOnce())

    const view = onReview.mock.calls[0][0] as CVView
    expect(view.name).toBe('Jane Smith')
  })

  it('on parse failure shows an error and keeps the form', async () => {
    const callModel = vi.fn().mockResolvedValue('not json at all')
    const onReview = vi.fn()

    render(
      <CVInterview
        onReview={onReview}
        callModel={callModel}
        busy={false}
        setBusy={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Build my CV' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/Could not build/),
    )
    expect(onReview).not.toHaveBeenCalled()
  })

  it('buildCVInterviewPrompt output contains the answered text when called with answers', () => {
    const answers = {
      'basics.name': 'Test Person',
      'basics.email': 'test@example.com',
      work: [{ company: 'TestCo', title: 'Engineer', whatDidYouDo: 'Built APIs.' }],
    }
    const prompt = buildCVInterviewPrompt(answers)
    expect(prompt).toContain('Test Person')
    expect(prompt).toContain('Built APIs.')
  })
})
