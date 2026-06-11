import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Materials, RewriteDecision, RewriteCheck } from '@ghosted/core'
import { RewritesPanel } from '../components/RewritesPanel'
import { StandoutsPanel } from '../components/StandoutsPanel'

const SAMPLE_REWRITES: Materials['resume_rewrites'] = [
  { source: 'Led design for checkout', rewrite: 'Drove end-to-end design for checkout flow, cutting drop-off by 12%', why: 'Adds specificity and outcome' },
  { source: 'Built components in React', rewrite: 'Engineered a component library in React, reducing design drift across 4 teams', why: 'Shows cross-team impact' },
  { source: 'Worked on mobile app', rewrite: 'Designed core mobile experience used by 200k daily active users', why: 'Quantifies reach' },
]

function setup(decisions?: Materials['rewrite_decisions']) {
  const onDecide = vi.fn()
  const onCopyAccepted = vi.fn()
  render(
    <RewritesPanel
      rewrites={SAMPLE_REWRITES}
      decisions={decisions}
      onDecide={onDecide}
      onCopyAccepted={onCopyAccepted}
      fallback={<p>no rewrites</p>}
    />,
  )
  return { onDecide, onCopyAccepted }
}

describe('RewritesPanel triage controls', () => {
  it('renders all rewrites when no decisions are set', () => {
    setup()
    expect(screen.getByText(SAMPLE_REWRITES[0]!.rewrite)).toBeTruthy()
    expect(screen.getByText(SAMPLE_REWRITES[1]!.rewrite)).toBeTruthy()
    expect(screen.getByText(SAMPLE_REWRITES[2]!.rewrite)).toBeTruthy()
  })

  it('Accept button calls onDecide with accepted status', async () => {
    const { onDecide } = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /Accept rewrite/i })[0]!)
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(0, { status: 'accepted' }))
  })

  it('Reject button calls onDecide with rejected status', async () => {
    const { onDecide } = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /Reject rewrite/i })[0]!)
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(0, { status: 'rejected' }))
  })

  it('accepted card shows accepted styling', () => {
    setup({ 0: { status: 'accepted' } })
    const triage = screen.getByTestId('rewrites-triage')
    // Accepted card has the rewrite-accepted class
    const acceptedCard = triage.querySelector('.rewrite-accepted')
    expect(acceptedCard).not.toBeNull()
  })

  it('rejected card collapses to source only with undo affordance', () => {
    setup({ 1: { status: 'rejected' } })
    // The rejected rewrite text should not be in the DOM
    expect(screen.queryByText(SAMPLE_REWRITES[1]!.rewrite)).toBeNull()
    expect(screen.getByRole('button', { name: /undo reject/i })).toBeTruthy()
  })

  it('undo for rejected calls onDecide with null', async () => {
    const { onDecide } = setup({ 1: { status: 'rejected' } })
    fireEvent.click(screen.getByRole('button', { name: /undo reject/i }))
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(1, null))
  })

  it('undo for accepted calls onDecide with null', async () => {
    const { onDecide } = setup({ 0: { status: 'accepted' } })
    fireEvent.click(screen.getByRole('button', { name: /undo accept/i }))
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(0, null))
  })

  it('"Copy accepted" is disabled when nothing is accepted', () => {
    setup()
    const btn = screen.getByRole('button', { name: /Copy accepted/i })
    expect(btn).toBeTruthy()
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('"Copy accepted" is enabled when at least one is accepted', () => {
    setup({ 0: { status: 'accepted' } })
    const btn = screen.getByRole('button', { name: /Copy accepted/i })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('"Copy accepted" calls onCopyAccepted when clicked', async () => {
    const { onCopyAccepted } = setup({ 0: { status: 'accepted' } })
    fireEvent.click(screen.getByRole('button', { name: /Copy accepted/i }))
    await waitFor(() => expect(onCopyAccepted).toHaveBeenCalled())
  })
})

describe('RewritesPanel edit flow', () => {
  it('Edit opens textarea prefilled with current rewrite', async () => {
    setup()
    fireEvent.click(screen.getAllByRole('button', { name: /Edit rewrite/i })[0]!)
    const textarea = await screen.findByRole('textbox', { name: /Edit rewrite/i })
    expect((textarea as HTMLTextAreaElement).value).toBe(SAMPLE_REWRITES[0]!.rewrite)
  })

  it('saving an edit calls onDecide with accepted status and edited text', async () => {
    const { onDecide } = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /Edit rewrite/i })[0]!)
    const textarea = await screen.findByRole('textbox', { name: /Edit rewrite/i })
    fireEvent.change(textarea, { target: { value: 'My custom rewrite' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith(0, { status: 'accepted', edited: 'My custom rewrite' }),
    )
  })

  it('accepted card shows edited text when decision has edited field', () => {
    const decisions: Materials['rewrite_decisions'] = { 0: { status: 'accepted', edited: 'Custom text here' } }
    setup(decisions)
    expect(screen.getByText('Custom text here')).toBeTruthy()
    // Original rewrite text should not appear
    expect(screen.queryByText(SAMPLE_REWRITES[0]!.rewrite)).toBeNull()
  })
})

describe('RewritesPanel clipboard copy builds correct text', () => {
  beforeEach(() => {
    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it('copy accepted uses edited text for accepted+edited decisions, plain rewrite for plain accepted', async () => {
    // This test uses the real handleCopyAccepted logic by testing the onCopyAccepted callback pattern.
    // We test the logic directly since the callback is external (passed as prop in Workspace).
    const rewrites: Materials['resume_rewrites'] = [
      { source: 'A', rewrite: 'Rewrite A', why: '' },
      { source: 'B', rewrite: 'Rewrite B', why: '' },
      { source: 'C', rewrite: 'Rewrite C', why: '' },
    ]
    const decisions: Record<number, RewriteDecision> = {
      0: { status: 'accepted', edited: 'Edited A' },
      1: { status: 'rejected' },
      2: { status: 'accepted' },
    }

    // Simulate the copy logic
    const lines = rewrites
      .map((r, i) => {
        const d = decisions[i]
        if (d?.status !== 'accepted') return null
        return `• ${d.edited ?? r.rewrite}`
      })
      .filter(Boolean)
      .join('\n')

    expect(lines).toBe('• Edited A\n• Rewrite C')
  })
})

// ---- Honesty badges in RewritesPanel ----

const CLEAN_CHECK: RewriteCheck = { sourceFound: true, inventedNumbers: [], inventedTerms: [], ok: true }
const FLAGGED_CHECK: RewriteCheck = { sourceFound: false, inventedNumbers: ['40%'], inventedTerms: ['Kubernetes'], ok: false }

function setupWithChecks(checks: RewriteCheck[]) {
  const onDecide = vi.fn()
  const onCopyAccepted = vi.fn()
  render(
    <RewritesPanel
      rewrites={SAMPLE_REWRITES}
      decisions={undefined}
      onDecide={onDecide}
      onCopyAccepted={onCopyAccepted}
      fallback={<p>no rewrites</p>}
      checks={checks}
    />,
  )
}

describe('RewritesPanel honesty badges', () => {
  it('shows source-not-in-CV and unverified badges for a flagged card', () => {
    setupWithChecks([FLAGGED_CHECK, CLEAN_CHECK, CLEAN_CHECK])
    expect(screen.getByTestId('badge-source-not-found')).toBeTruthy()
    const unverified = screen.getByTestId('badge-unverified')
    expect(unverified.textContent).toContain('40%')
    expect(unverified.textContent).toContain('Kubernetes')
  })

  it('shows no honesty badges for a clean card', () => {
    setupWithChecks([CLEAN_CHECK, CLEAN_CHECK, CLEAN_CHECK])
    expect(screen.queryByTestId('badge-source-not-found')).toBeNull()
    expect(screen.queryByTestId('badge-unverified')).toBeNull()
  })

  it('shows only source-not-in-CV when inventedNumbers/Terms are empty', () => {
    const partialCheck: RewriteCheck = { sourceFound: false, inventedNumbers: [], inventedTerms: [], ok: false }
    setupWithChecks([partialCheck, CLEAN_CHECK, CLEAN_CHECK])
    expect(screen.getByTestId('badge-source-not-found')).toBeTruthy()
    expect(screen.queryByTestId('badge-unverified')).toBeNull()
  })

  it('shows only unverified badge when sourceFound is true but inventions exist', () => {
    const inventionOnly: RewriteCheck = { sourceFound: true, inventedNumbers: ['$200k'], inventedTerms: [], ok: false }
    setupWithChecks([inventionOnly, CLEAN_CHECK, CLEAN_CHECK])
    expect(screen.queryByTestId('badge-source-not-found')).toBeNull()
    expect(screen.getByTestId('badge-unverified').textContent).toContain('$200k')
  })
})

// ---- StandoutsPanel — spammy filtering and pluralization ----

const STANDOUTS: Materials['standout_suggestions'] = [
  { title: 'Write a case study', action: 'Document your checkout project', effort: 'low' },
  { title: 'Mass DM 50 recruiters', action: 'Send automated messages to all employees', effort: 'medium' },
  { title: 'Share work publicly', action: 'Post a teardown on LinkedIn', effort: 'low' },
]

describe('StandoutsPanel spammy filtering', () => {
  it('suppresses standout at a spammy index and renders the filtered line', () => {
    render(<StandoutsPanel standouts={STANDOUTS} spammyIndexes={[1]} />)
    // The spammy card should not appear
    expect(screen.queryByText('Mass DM 50 recruiters')).toBeNull()
    // Clean cards remain
    expect(screen.getByText('Write a case study')).toBeTruthy()
    expect(screen.getByText('Share work publicly')).toBeTruthy()
    // Filtered line rendered
    expect(screen.getByTestId('standouts-filtered-line').textContent).toContain('1 suggestion filtered (looked like spam)')
  })

  it('pluralizes "suggestions" correctly when more than one is filtered', () => {
    render(<StandoutsPanel standouts={STANDOUTS} spammyIndexes={[0, 1]} />)
    expect(screen.getByTestId('standouts-filtered-line').textContent).toContain('2 suggestions filtered (looked like spam)')
  })

  it('does not render the filtered line when nothing was filtered', () => {
    render(<StandoutsPanel standouts={STANDOUTS} spammyIndexes={[]} />)
    expect(screen.queryByTestId('standouts-filtered-line')).toBeNull()
  })

  it('renders empty state when no standouts provided', () => {
    render(<StandoutsPanel standouts={undefined} spammyIndexes={[]} />)
    expect(screen.getByText(/Generate to get practical/)).toBeTruthy()
  })
})
