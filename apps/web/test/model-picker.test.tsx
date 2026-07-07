import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import type { AIAuth } from '@ghosted/core'

// ---------------------------------------------------------------------------
// useHosted.tsx memoizes its /api/config fetch in a module-level promise so
// every consumer on a page shares one request. That means each scenario below
// needs a FRESH module graph (useHosted + everything that imports it) or the
// second test would just replay the first test's cached config. We reset the
// module registry and re-import ModelPicker (and the auth pieces it wires
// through React context) together so they share one consistent graph.
// ---------------------------------------------------------------------------

interface ConfigPayload {
  hosted: boolean
  house?: { provider: string; model: string; label: string }
}

function mockFetch(config: ConfigPayload) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/config')) {
      return Promise.resolve(new Response(JSON.stringify(config), { status: 200 }))
    }
    if (url.includes('/api/models')) {
      return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }))
    }
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as unknown as typeof fetch
}

async function loadFreshModelPicker() {
  vi.resetModules()
  const [{ AIAuthProvider }, { MemoryAIAuthRepo }, { ModelPicker }] = await Promise.all([
    import('../lib/useAIAuth'),
    import('../lib/aiAuthRepo'),
    import('../components/ModelPicker'),
  ])
  return { AIAuthProvider, MemoryAIAuthRepo, ModelPicker }
}

describe('ModelPicker — hosted chip vs select', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    cleanup()
  })

  it('hosted + no auth of your own → renders the house chip and no <select>', async () => {
    globalThis.fetch = mockFetch({
      hosted: true,
      house: { provider: 'codex', model: 'gpt-5.5', label: 'Codex with GPT-5.5' },
    })
    const { AIAuthProvider, MemoryAIAuthRepo, ModelPicker } = await loadFreshModelPicker()

    render(
      <AIAuthProvider repo={new MemoryAIAuthRepo(null)}>
        <ModelPicker />
      </AIAuthProvider>,
    )

    await waitFor(() => expect(screen.getByText(/shared account/)).toBeTruthy())
    expect(screen.getByText(/Codex with GPT-5\.5/)).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('hosted + the visitor has their own connection → renders the select, not the chip', async () => {
    globalThis.fetch = mockFetch({
      hosted: true,
      house: { provider: 'codex', model: 'gpt-5.5', label: 'Codex with GPT-5.5' },
    })
    const { AIAuthProvider, MemoryAIAuthRepo, ModelPicker } = await loadFreshModelPicker()

    const ownAuth: AIAuth = { provider: 'anthropic', method: 'local_cli' }
    render(
      <AIAuthProvider repo={new MemoryAIAuthRepo(ownAuth)}>
        <ModelPicker />
      </AIAuthProvider>,
    )

    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy())
    expect(screen.queryByText(/shared account/)).toBeNull()
  })

  it('not hosted (no house account) + no auth → renders the select, since there is no shared account to ride', async () => {
    globalThis.fetch = mockFetch({ hosted: false })
    const { AIAuthProvider, MemoryAIAuthRepo, ModelPicker } = await loadFreshModelPicker()

    render(
      <AIAuthProvider repo={new MemoryAIAuthRepo(null)}>
        <ModelPicker />
      </AIAuthProvider>,
    )

    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy())
    expect(screen.queryByText(/shared account/)).toBeNull()
  })
})
