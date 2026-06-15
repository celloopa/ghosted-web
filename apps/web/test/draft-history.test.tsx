import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { MaterialsSnapshot } from '@ghosted/core'
import { DraftHistory } from '../components/DraftHistory'

// ---------------------------------------------------------------------------
// Deferred promise helper
// ---------------------------------------------------------------------------
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------
const NOW_ISO = '2026-06-15T12:00:00Z'

const SNAP_A: MaterialsSnapshot = {
  cover_letter: 'Dear hiring team, I am excited to apply for this role.',
  summary: 'Summary A',
  at: '2026-06-15T11:58:00Z', // 2 minutes ago
}

const SNAP_B: MaterialsSnapshot = {
  summary: 'Summary B only, no cover letter',
  at: '2026-06-15T10:00:00Z', // 2 hours ago
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DraftHistory — empty history', () => {
  it('renders nothing when history is empty', () => {
    const { container } = render(
      <DraftHistory history={[]} onRestore={vi.fn()} nowISO={NOW_ISO} />,
    )
    expect(container.innerHTML).toBe('')
  })
})

describe('DraftHistory — rendering with snapshots', () => {
  it('shows "Previous versions (2)" in summary when 2 snapshots provided', () => {
    render(
      <DraftHistory history={[SNAP_A, SNAP_B]} onRestore={vi.fn()} nowISO={NOW_ISO} />,
    )
    expect(screen.getByText('Previous versions (2)')).toBeTruthy()
  })

  it('renders preview text for each snapshot in order', () => {
    render(
      <DraftHistory history={[SNAP_A, SNAP_B]} onRestore={vi.fn()} nowISO={NOW_ISO} />,
    )
    // SNAP_A preview: cover_letter (first 90 chars or so)
    expect(screen.getByText(/Dear hiring team/)).toBeTruthy()
    // SNAP_B preview: falls back to summary
    expect(screen.getByText(/Summary B only/)).toBeTruthy()
  })

  it('renders both Preview and Restore buttons for each row', () => {
    render(
      <DraftHistory history={[SNAP_A, SNAP_B]} onRestore={vi.fn()} nowISO={NOW_ISO} />,
    )
    // 2 snapshots × 2 button types
    expect(screen.getAllByRole('button', { name: /Preview version/i })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /Restore version/i })).toHaveLength(2)
  })
})

describe('DraftHistory — relativeTime reflected', () => {
  it('shows "2 minutes ago" for a snapshot 2 minutes before nowISO', () => {
    render(
      <DraftHistory history={[SNAP_A]} onRestore={vi.fn()} nowISO={NOW_ISO} />,
    )
    expect(screen.getByText('2 minutes ago')).toBeTruthy()
  })
})

describe('DraftHistory — Preview toggle', () => {
  it('clicking Preview expands and shows the cover_letter content in a pre element', async () => {
    render(
      <DraftHistory history={[SNAP_A]} onRestore={vi.fn()} nowISO={NOW_ISO} />,
    )
    const previewBtn = screen.getByRole('button', { name: /Preview version/i })
    fireEvent.click(previewBtn)
    // Wait for a <pre class="doc"> to appear and contain the cover letter text
    await waitFor(() => {
      const pres = document.querySelectorAll('pre.doc')
      expect(pres.length).toBe(1)
      expect(pres[0]!.textContent).toBe(SNAP_A.cover_letter!)
    })
  })

  it('clicking Preview again hides the expanded content', async () => {
    render(
      <DraftHistory history={[SNAP_A]} onRestore={vi.fn()} nowISO={NOW_ISO} />,
    )
    const previewBtn = screen.getByRole('button', { name: /Preview version/i })
    // Open
    fireEvent.click(previewBtn)
    await waitFor(() => {
      expect(document.querySelectorAll('pre.doc').length).toBe(1)
    })
    // Button should now say "Hide"
    const hideBtn = screen.getByRole('button', { name: /Hide/i })
    fireEvent.click(hideBtn)
    await waitFor(() => {
      expect(document.querySelectorAll('pre.doc').length).toBe(0)
    })
  })

  it('shows summary in pre when snapshot has no cover_letter', async () => {
    render(
      <DraftHistory history={[SNAP_B]} onRestore={vi.fn()} nowISO={NOW_ISO} />,
    )
    const previewBtn = screen.getByRole('button', { name: /Preview version/i })
    fireEvent.click(previewBtn)
    await waitFor(() => {
      const pres = document.querySelectorAll('pre.doc')
      expect(pres.length).toBe(1)
      expect(pres[0]!.textContent).toBe(SNAP_B.summary!)
    })
  })
})

describe('DraftHistory — Restore action', () => {
  it('calls onRestore with the exact snapshot object when Restore is clicked', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined)
    render(
      <DraftHistory history={[SNAP_A, SNAP_B]} onRestore={onRestore} nowISO={NOW_ISO} />,
    )
    const restoreBtns = screen.getAllByRole('button', { name: /Restore version/i })
    fireEvent.click(restoreBtns[0]!)
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(SNAP_A))
  })

  it('disables the Restore button and shows "Restoring…" while promise is pending', async () => {
    const def = deferred<void>()
    const onRestore = vi.fn().mockReturnValue(def.promise)

    render(
      <DraftHistory history={[SNAP_A]} onRestore={onRestore} nowISO={NOW_ISO} />,
    )
    const restoreBtn = screen.getByRole('button', { name: /Restore version/i })
    fireEvent.click(restoreBtn)

    // Button should be disabled with "Restoring…" label
    await waitFor(() => {
      const btn = screen.getByText('Restoring…').closest('button')
      expect(btn).toBeTruthy()
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    })

    // Resolve and confirm button goes back to normal
    def.resolve(undefined)
    await waitFor(() => {
      expect(screen.queryByText('Restoring…')).toBeNull()
    })
  })

  it('only disables the clicked row restore button, not others', async () => {
    const def = deferred<void>()
    const onRestore = vi.fn().mockReturnValue(def.promise)

    render(
      <DraftHistory history={[SNAP_A, SNAP_B]} onRestore={onRestore} nowISO={NOW_ISO} />,
    )
    const restoreBtns = screen.getAllByRole('button', { name: /Restore version/i })
    fireEvent.click(restoreBtns[0]!)

    await waitFor(() => {
      expect(screen.getByText('Restoring…')).toBeTruthy()
    })

    // Second row's Restore button should still be enabled.
    // While row 0 is restoring its aria-label is removed (button shows "Restoring…"),
    // so querying by /Restore version/ should find only the second row's button.
    const stillActiveRestores = screen.getAllByRole('button', { name: /Restore version/i })
    expect(stillActiveRestores.length).toBe(1)
    expect((stillActiveRestores[0]! as HTMLButtonElement).disabled).toBe(false)

    // Resolve and let React flush the state update
    await waitFor(async () => {
      def.resolve(undefined)
    })
    await waitFor(() => {
      expect(screen.queryByText('Restoring…')).toBeNull()
    })
  })
})
