import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AIAuthProvider } from '../lib/useAIAuth'
import { MemoryAIAuthRepo } from '../lib/aiAuthRepo'
import { CVBuilder } from '../components/CVBuilder'
import type { AIAuth } from '@ghosted/core'

const VALID_CV = JSON.stringify({
  basics: { name: 'Cello Rondon', email: 'cello@cello.design' },
  work: [{ name: 'Studio', position: 'Designer', highlights: [] }],
  skills: [{ name: 'TypeScript' }],
})

const MOCK_AUTH: AIAuth = {
  provider: 'anthropic',
  method: 'local_cli',
  model: 'claude-sonnet-4-5',
}

function renderBuilder(auth: AIAuth | null = null, onConfirm = vi.fn()) {
  const repo = new MemoryAIAuthRepo(auth)
  render(
    <AIAuthProvider repo={repo}>
      <CVBuilder onConfirm={onConfirm} />
    </AIAuthProvider>,
  )
  return { onConfirm }
}

// Suppress fetch-not-defined noise from ModelPicker in jsdom
const NO_OP_FETCH = () =>
  Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }))

describe('CVBuilder', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = NO_OP_FETCH as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('renders the interview tab by default', () => {
    renderBuilder()
    const interviewTab = screen.getByRole('tab', { name: 'Answer a few questions' })
    expect(interviewTab.getAttribute('aria-selected')).toBe('true')
  })

  it('switching to the upload tab renders the upload panel', async () => {
    renderBuilder(MOCK_AUTH)
    // Wait for auth to settle, then switch tabs
    await waitFor(() => expect(screen.queryByText('Connect your AI to build your CV automatically.')).toBeNull())
    fireEvent.click(screen.getByRole('tab', { name: 'Use my old résumé' }))
    await waitFor(() => expect(screen.getByText('Or paste your résumé text')).toBeTruthy())
  })

  it('interview mode with no auth shows the ConnectAI gate', async () => {
    renderBuilder(null)
    // Wait for auth to load (useEffect)
    await waitFor(() =>
      expect(screen.getByText('Connect your AI to build your CV automatically.')).toBeTruthy(),
    )
  })

  it('upload mode with no auth shows the ConnectAI gate', async () => {
    renderBuilder(null)
    fireEvent.click(screen.getByRole('tab', { name: 'Use my old résumé' }))
    await waitFor(() =>
      expect(screen.getByText('Connect your AI to build your CV automatically.')).toBeTruthy(),
    )
  })

  it('paste-JSON mode never shows ConnectAI', async () => {
    renderBuilder(null)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced: paste JSON' }))

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/basics/)).toBeTruthy(),
    )
    // ConnectAI text should not appear
    expect(screen.queryByText('Connect your AI to build your CV automatically.')).toBeNull()
  })

  it('paste-JSON path accepts a valid JSON Resume and calls onConfirm', async () => {
    const onConfirm = vi.fn()
    renderBuilder(null, onConfirm)

    fireEvent.click(screen.getByRole('button', { name: 'Advanced: paste JSON' }))

    await waitFor(() => expect(screen.getByPlaceholderText(/basics/)).toBeTruthy())

    const textarea = screen.getByPlaceholderText(/basics/)
    fireEvent.change(textarea, { target: { value: VALID_CV } })

    const useBtn = await screen.findByRole('button', { name: 'Use this CV' })
    expect((useBtn as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(useBtn)
    expect(onConfirm).toHaveBeenCalledWith(VALID_CV)
  })

  it('paste-JSON path shows a validation error for invalid JSON', async () => {
    renderBuilder(null)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced: paste JSON' }))

    await waitFor(() => expect(screen.getByPlaceholderText(/basics/)).toBeTruthy())

    const textarea = screen.getByPlaceholderText(/basics/)
    fireEvent.change(textarea, { target: { value: 'not json' } })

    // Error should appear
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())

    const useBtn = screen.getByRole('button', { name: 'Use this CV' })
    expect((useBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('upload mode with auth shows the file input and paste textarea', async () => {
    renderBuilder(MOCK_AUTH)
    fireEvent.click(screen.getByRole('tab', { name: 'Use my old résumé' }))
    await waitFor(() =>
      expect(screen.getByText('Or paste your résumé text')).toBeTruthy(),
    )
    expect(screen.getByLabelText('Your résumé file (PDF, TXT, or Markdown)')).toBeTruthy()
  })
})
