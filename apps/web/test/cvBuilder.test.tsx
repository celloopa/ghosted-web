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

// Helper: switch to upload tab and wait for the panel
async function switchToUploadTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Use my old résumé' }))
  await waitFor(() => expect(screen.getByText('Or paste your résumé text')).toBeTruthy())
}

// Helper: create a minimal File-like object for jsdom that has a working .text() method
function makeFile(name: string, content: string, type: string): File {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  // Some jsdom versions don't expose Blob.prototype.text — shim it.
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(content),
    })
  }
  return file
}

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
    await switchToUploadTab()
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

  // ── New tests for multi-file, auto-fallback, text path, manual escape hatch ──

  it('file input has multiple attribute', async () => {
    renderBuilder(MOCK_AUTH)
    await switchToUploadTab()
    const input = screen.getByLabelText('Your résumé file (PDF, TXT, or Markdown)') as HTMLInputElement
    expect(input.multiple).toBe(true)
  })

  it('multi-file: selecting two files sends a 2-source body to /api/cv/extract', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/models' || url === '/api/model-picker') {
        return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }))
      }
      // /api/cv/extract — return text path (no needsVision)
      if (url === '/api/cv/extract') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: 'Resume content', needsVision: false }), { status: 200 }),
        )
      }
      // /api/generate
      if (url === '/api/generate') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: VALID_CV }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    renderBuilder(MOCK_AUTH)
    await switchToUploadTab()

    const input = screen.getByLabelText('Your résumé file (PDF, TXT, or Markdown)') as HTMLInputElement

    const file1 = makeFile('resume1.txt', 'First resume content', 'text/plain')
    const file2 = makeFile('resume2.txt', 'Second resume content', 'text/plain')

    // jsdom doesn't let you set files directly; use Object.defineProperty
    Object.defineProperty(input, 'files', {
      value: [file1, file2],
      configurable: true,
    })
    fireEvent.change(input)

    const btn = screen.getByRole('button', { name: 'Read my résumé' })
    await act(async () => {
      fireEvent.click(btn)
    })

    await waitFor(() => {
      const extractCalls = fetchSpy.mock.calls.filter(([url]) => url === '/api/cv/extract')
      expect(extractCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(extractCalls[0]![1]!.body as string) as { sources: unknown[] }
      expect(body.sources).toHaveLength(2)
    })
  })

  it('auto-fallback: needsVision:true routes to /api/cv/vision, not /api/generate', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/cv/extract') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: '', needsVision: true }), { status: 200 }),
        )
      }
      if (url === '/api/cv/vision') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: VALID_CV }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    renderBuilder(MOCK_AUTH)
    await switchToUploadTab()

    // Provide pasted text so there is at least one source
    const textarea = screen.getByPlaceholderText('Paste the full text of your résumé here…')
    fireEvent.change(textarea, { target: { value: 'Some pasted resume text' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read my résumé' }))
    })

    await waitFor(() => {
      const visionCalls = fetchSpy.mock.calls.filter(([url]) => url === '/api/cv/vision')
      expect(visionCalls.length).toBeGreaterThan(0)

      const generateCalls = fetchSpy.mock.calls.filter(([url]) => url === '/api/generate')
      expect(generateCalls.length).toBe(0)
    })
  })

  it('text path: needsVision:false with text goes to /api/generate, not /api/cv/vision', async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/cv/extract') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: 'Substantial resume text here', needsVision: false }), { status: 200 }),
        )
      }
      if (url === '/api/generate') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: VALID_CV }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    renderBuilder(MOCK_AUTH)
    await switchToUploadTab()

    const textarea = screen.getByPlaceholderText('Paste the full text of your résumé here…')
    fireEvent.change(textarea, { target: { value: 'Substantial resume text here' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read my résumé' }))
    })

    await waitFor(() => {
      const generateCalls = fetchSpy.mock.calls.filter(([url]) => url === '/api/generate')
      expect(generateCalls.length).toBeGreaterThan(0)

      const visionCalls = fetchSpy.mock.calls.filter(([url]) => url === '/api/cv/vision')
      expect(visionCalls.length).toBe(0)
    })
  })

  it('manual escape hatch: "Read it from the page images instead" triggers /api/cv/vision', async () => {
    // First, complete a successful text-path read so sources are stored and the escape hatch appears
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/cv/extract') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: 'Some resume text', needsVision: false }), { status: 200 }),
        )
      }
      if (url === '/api/generate') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: VALID_CV }), { status: 200 }),
        )
      }
      if (url === '/api/cv/vision') {
        return Promise.resolve(
          new Response(JSON.stringify({ text: VALID_CV }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    renderBuilder(MOCK_AUTH)
    await switchToUploadTab()

    // Provide pasted text
    const textarea = screen.getByPlaceholderText('Paste the full text of your résumé here…')
    fireEvent.change(textarea, { target: { value: 'Some resume text for testing' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read my résumé' }))
    })

    // After successful text read, the escape hatch link should appear in the upload panel
    await waitFor(() => {
      expect(screen.getByText('Read it from the page images instead')).toBeTruthy()
    })

    // Click the escape hatch
    await act(async () => {
      fireEvent.click(screen.getByText('Read it from the page images instead'))
    })

    await waitFor(() => {
      const visionCalls = fetchSpy.mock.calls.filter(([url]) => url === '/api/cv/vision')
      expect(visionCalls.length).toBeGreaterThan(0)
    })
  })
})
