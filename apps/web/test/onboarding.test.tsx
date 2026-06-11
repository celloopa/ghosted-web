import { describe, it, expect, vi } from 'vitest'
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

describe('baseline onboarding wizard', () => {
  it('CV step blocks continue until a valid CV is provided', async () => {
    setup()
    const continueBtn = await screen.findByRole('button', { name: 'Continue' })
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText(/basics/), { target: { value: 'not json' } })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText(/basics/), { target: { value: VALID_CV } })
    expect(await screen.findByText(/✓ Cello Rondon/)).toBeTruthy()
    expect((continueBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('saves a draft at each step and prefills links from CV profiles', async () => {
    const repo = setup()
    fireEvent.change(await screen.findByPlaceholderText(/basics/), { target: { value: VALID_CV } })
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
    fireEvent.change(await screen.findByPlaceholderText(/basics/), { target: { value: VALID_CV } })
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
