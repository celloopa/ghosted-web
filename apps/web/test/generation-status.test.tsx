import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { GenerationStatus } from '../components/GenerationStatus'

// The generation flow is one bounded model call that cannot stream. This
// component only ever reports what is actually true — no fake progress bars.
// Fake timers drive the elapsed-seconds ticker deterministically.

describe('GenerationStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing while inactive', () => {
    render(<GenerationStatus active={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the assembling-the-prompt phase immediately on activation', () => {
    render(<GenerationStatus active={true} modelLabel="Codex with GPT-5.5" />)
    expect(screen.getByText(/assembling the prompt — cv, posting, fit/)).toBeTruthy()
  })

  it('switches to the writing phase with elapsed seconds once past the assembling window', () => {
    render(<GenerationStatus active={true} modelLabel="Codex with GPT-5.5" />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText(/writing with Codex with GPT-5\.5/)).toBeTruthy()
    expect(screen.getByText('2s')).toBeTruthy()
    expect(screen.queryByText(/assembling the prompt/)).toBeNull()
  })

  it('falls back to "the model" when no modelLabel is given', () => {
    render(<GenerationStatus active={true} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText(/writing with the model/)).toBeTruthy()
  })

  it('sub-line: under 15s says it is one bounded call', () => {
    render(<GenerationStatus active={true} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText(/one bounded call\. the code already did the deterministic work\./)).toBeTruthy()
  })

  it('sub-line: 15–40s says it is still writing', () => {
    render(<GenerationStatus active={true} />)
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(screen.getByText(/still writing\. letters take longer than chips suggest\./)).toBeTruthy()
  })

  it('sub-line: 40–75s says it is a long one', () => {
    render(<GenerationStatus active={true} />)
    act(() => {
      vi.advanceTimersByTime(50_000)
    })
    expect(screen.getByText(/long one\. the model returns everything at once — no partials to show\./)).toBeTruthy()
  })

  it('sub-line: over 75s says it is unusually long', () => {
    render(<GenerationStatus active={true} />)
    act(() => {
      vi.advanceTimersByTime(80_000)
    })
    expect(screen.getByText(/unusually long\. if it errors, the message will say why\./)).toBeTruthy()
  })

  it('on completion (active true→false) shows the checking message, then disappears after ~800ms', () => {
    const { rerender } = render(<GenerationStatus active={true} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    rerender(<GenerationStatus active={false} />)
    expect(screen.getByText(/checking the draft — word cap, banned phrases, honesty flags/)).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('has role=status and aria-live=polite while visible', () => {
    render(<GenerationStatus active={true} />)
    const el = screen.getByRole('status')
    expect(el.getAttribute('aria-live')).toBe('polite')
  })

  it('reactivating after a completed run restarts the elapsed clock from zero', () => {
    const { rerender } = render(<GenerationStatus active={true} />)
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    rerender(<GenerationStatus active={false} />)
    act(() => {
      vi.advanceTimersByTime(800)
    })
    rerender(<GenerationStatus active={true} />)
    expect(screen.getByText(/assembling the prompt — cv, posting, fit/)).toBeTruthy()
  })

  it('is purely presentational — never calls fetch', () => {
    const fetchSpy = vi.fn()
    const original = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    render(<GenerationStatus active={true} />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    globalThis.fetch = original
  })
})
