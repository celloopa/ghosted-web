import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ActionButton } from '../components/ActionButton'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// ---------------------------------------------------------------------------
// 1. Renders idleLabel and clicking calls onAct once
// ---------------------------------------------------------------------------

describe('ActionButton — basic render & single click', () => {
  it('renders idleLabel and calls onAct exactly once on click', async () => {
    const onAct = vi.fn().mockResolvedValue(undefined)
    render(
      <ActionButton
        onAct={onAct}
        idleLabel="Revise letter"
        runningLabel="Revising…"
        successMs={10}
      />,
    )

    const btn = screen.getByRole('button', { name: /Revise letter/i })
    expect(btn).toBeTruthy()

    await act(async () => {
      fireEvent.click(btn)
    })

    expect(onAct).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// 2. Double-click fires onAct only ONCE
// ---------------------------------------------------------------------------

describe('ActionButton — double-click guard', () => {
  it('fires onAct only once even when clicked twice rapidly', async () => {
    const d = deferred<void>()
    const onAct = vi.fn().mockReturnValue(d.promise)

    render(
      <ActionButton
        onAct={onAct}
        idleLabel="Revise letter"
        runningLabel="Revising…"
        successMs={10}
        data-testid="ab"
      />,
    )

    const btn = screen.getByRole('button', { name: /Revise letter/i })

    // Two rapid clicks
    fireEvent.click(btn)
    fireEvent.click(btn)

    // onAct must have been called exactly once
    expect(onAct).toHaveBeenCalledTimes(1)

    // Button is disabled and shows runningLabel
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /Revising…/i })).toBeTruthy()

    // Clean up: resolve the deferred promise
    await act(async () => {
      d.resolve()
    })
  })
})

// ---------------------------------------------------------------------------
// 3. While pending: button disabled, shows runningLabel
// ---------------------------------------------------------------------------

describe('ActionButton — running state', () => {
  it('disables the button and shows runningLabel while the promise is pending', async () => {
    const d = deferred<void>()
    const onAct = vi.fn().mockReturnValue(d.promise)

    render(
      <ActionButton
        onAct={onAct}
        idleLabel="Export PDFs"
        runningLabel="Generating…"
        successMs={10}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Export PDFs/i }))

    const btn = screen.getByRole('button', { name: /Generating…/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)

    // Clean up
    await act(async () => {
      d.resolve()
    })
  })
})

// ---------------------------------------------------------------------------
// 4. On resolve: shows doneLabel, then returns to idleLabel
// ---------------------------------------------------------------------------

describe('ActionButton — success flash', () => {
  it('shows doneLabel on resolve, then returns to idleLabel after successMs', async () => {
    const d = deferred<void>()
    const onAct = vi.fn().mockReturnValue(d.promise)

    render(
      <ActionButton
        onAct={onAct}
        idleLabel="Revise letter"
        runningLabel="Revising…"
        doneLabel="Done ✓"
        successMs={10}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Revise letter/i }))

    // Resolve inside act so React flushes the state update
    await act(async () => {
      d.resolve()
    })

    // Done label should now be visible
    expect(screen.getByRole('button', { name: /Done ✓/i })).toBeTruthy()

    // After successMs=10 ms, it returns to idle
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Revise letter/i })).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 5. On reject: shows error alert, re-enables button, calls onError
// ---------------------------------------------------------------------------

describe('ActionButton — error state', () => {
  it('shows role=alert with error text, re-enables button, and calls onError', async () => {
    const d = deferred<void>()
    const onAct = vi.fn().mockReturnValue(d.promise)
    const onError = vi.fn()

    render(
      <ActionButton
        onAct={onAct}
        idleLabel="Revise letter"
        runningLabel="Revising…"
        onError={onError}
        successMs={10}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Revise letter/i }))

    await act(async () => {
      d.reject(new Error('boom'))
    })

    // Error alert visible
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('boom')

    // Button re-enabled and shows idleLabel
    const btn = screen.getByRole('button', { name: /Revise letter/i })
    expect((btn as HTMLButtonElement).disabled).toBe(false)

    // onError called with the message
    expect(onError).toHaveBeenCalledWith('boom')
  })
})

// ---------------------------------------------------------------------------
// 6. External disabled prop: button is disabled and click doesn't call onAct
// ---------------------------------------------------------------------------

describe('ActionButton — external disabled', () => {
  it('is disabled and does not call onAct when disabled prop is true', () => {
    const onAct = vi.fn().mockResolvedValue(undefined)

    render(
      <ActionButton
        onAct={onAct}
        idleLabel="Revise letter"
        runningLabel="Revising…"
        disabled
      />,
    )

    const btn = screen.getByRole('button', { name: /Revise letter/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(btn)
    expect(onAct).not.toHaveBeenCalled()
  })
})
