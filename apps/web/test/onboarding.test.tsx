import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BaselineProvider } from '../lib/useBaseline'
import { MemoryBaselineRepo } from '../lib/baselineRepo'
import { AIAuthProvider } from '../lib/useAIAuth'
import { MemoryAIAuthRepo } from '../lib/aiAuthRepo'
import Onboarding from '../app/onboarding/page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const VALID_CV = JSON.stringify({
  basics: { name: 'Cello Rondon', profiles: [{ network: 'GitHub', url: 'https://github.com/celloopa' }] },
  work: [{ name: 'Asheville Dispensary' }],
  skills: [{ name: 'TypeScript' }],
})

// Suppress ModelPicker fetch noise
const NO_OP_FETCH = () =>
  Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }))

function setup(repo = new MemoryBaselineRepo()) {
  render(
    <BaselineProvider repo={repo}>
      <AIAuthProvider repo={new MemoryAIAuthRepo()}>
        <Onboarding />
      </AIAuthProvider>
    </BaselineProvider>,
  )
  return repo
}

/** Navigate the CVBuilder to the paste-JSON textarea */
async function openJsonPaste() {
  // Click the "Advanced: paste JSON" toggle in CVBuilder
  const toggle = await screen.findByRole('button', { name: 'Advanced: paste JSON' })
  fireEvent.click(toggle)
  // Wait for the JSON textarea (placeholder contains "basics")
  return await screen.findByPlaceholderText(/basics/)
}

/** Paste a CV in the paste-JSON path and confirm it */
async function enterCV(cv: string) {
  const textarea = await openJsonPaste()
  fireEvent.change(textarea, { target: { value: cv } })
  // Click "Use this CV"
  const useBtn = await screen.findByRole('button', { name: 'Use this CV' })
  await waitFor(() => expect((useBtn as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(useBtn)
}

describe('baseline onboarding wizard', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = NO_OP_FETCH as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('CV step blocks continue until a valid CV is provided', async () => {
    setup()
    const continueBtn = await screen.findByRole('button', { name: 'Continue' })
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true)

    const textarea = await openJsonPaste()

    fireEvent.change(textarea, { target: { value: 'not json' } })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(textarea, { target: { value: VALID_CV } })
    // Click "Use this CV" to confirm into the onboarding draft
    const useBtn = await screen.findByRole('button', { name: 'Use this CV' })
    await waitFor(() => expect((useBtn as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(useBtn)

    expect(await screen.findByText(/✓ Cello Rondon/)).toBeTruthy()
    expect((continueBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('saves a draft at each step and prefills links from CV profiles', async () => {
    const repo = setup()
    await enterCV(VALID_CV)

    // cv summary should appear
    await screen.findByText(/✓ Cello Rondon/)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))

    // Voice step — skip
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }))

    // Links step — prefilled from the CV's GitHub profile
    expect(await screen.findByDisplayValue('https://github.com/celloopa')).toBeTruthy()

    // draft persisted along the way
    await waitFor(async () => {
      expect((await repo.load()).cv_json).toBe(VALID_CV)
    })
  })

  it('finish is gated on baseline readiness (CV + role targeting)', async () => {
    setup()
    await enterCV(VALID_CV)

    await screen.findByText(/✓ Cello Rondon/)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' })) // voice
    await screen.findByRole('heading', { name: 'Links' })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // links (prefilled)

    // Targeting: continue disabled until a role type is picked
    await screen.findByRole('heading', { name: 'Targeting' })
    const continueBtn = screen.getByRole('button', { name: 'Continue' })
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Design Engineer' }))
    expect((continueBtn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(continueBtn)

    // Connect AI step: skippable, never blocks the baseline
    await screen.findByRole('heading', { name: 'Connect your AI' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    // Review: what the agent will know + enabled finish
    expect(await screen.findByText(/What the agent will know/)).toBeTruthy()
    expect(screen.getByText(/not connected — tracking works/)).toBeTruthy()
    const finish = screen.getByRole('button', { name: 'Baseline ready' })
    expect((finish as HTMLButtonElement).disabled).toBe(false)
  })
})
