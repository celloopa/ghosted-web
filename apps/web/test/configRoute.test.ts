/**
 * Unit tests for GET /api/config — the public, no-secrets config endpoint.
 *
 * Mirrors the env-patching pattern used in houseConnection.test.ts so tests
 * don't bleed into each other.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from '../app/api/config/route'

const ORIG_ENV = { ...process.env }

function setEnv(patch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = v
    }
  }
}

beforeEach(() => {
  delete process.env.GHOSTED_HOUSE_TOKEN
  delete process.env.GHOSTED_HOUSE_PROVIDER
  delete process.env.GHOSTED_HOUSE_MODEL
})

afterEach(() => {
  for (const k of ['GHOSTED_HOUSE_TOKEN', 'GHOSTED_HOUSE_PROVIDER', 'GHOSTED_HOUSE_MODEL']) {
    delete process.env[k]
  }
  Object.assign(process.env, ORIG_ENV)
})

describe('GET /api/config', () => {
  it('returns hosted: false and no house field when no house account is configured', async () => {
    const res = GET()
    const body = (await res.json()) as { hosted: boolean; house?: unknown }
    expect(body.hosted).toBe(false)
    expect(body.house).toBeUndefined()
  })

  it('returns the anthropic house shape when GHOSTED_HOUSE_TOKEN is set', async () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: 'sk-ant-oat01-test-token-long-enough-here' })
    const res = GET()
    const body = (await res.json()) as { hosted: boolean; house?: { provider: string; model: string; label: string } }
    expect(body.hosted).toBe(true)
    expect(body.house).toBeDefined()
    expect(body.house?.provider).toBe('anthropic')
    expect(body.house?.model).toBe('claude-sonnet-4-6')
    expect(body.house?.label).toBe('Claude Sonnet 4.6')
    // No secret leaks — the response body must never contain the token.
    expect(JSON.stringify(body)).not.toContain('sk-ant-oat01-test-token-long-enough-here')
  })

  it('returns the codex house shape when GHOSTED_HOUSE_PROVIDER=codex', async () => {
    setEnv({ GHOSTED_HOUSE_PROVIDER: 'codex' })
    const res = GET()
    const body = (await res.json()) as { hosted: boolean; house?: { provider: string; model: string; label: string } }
    expect(body.hosted).toBe(true)
    expect(body.house?.provider).toBe('codex')
    expect(body.house?.model).toBe('gpt-5.5')
    expect(body.house?.label).toBe('Codex with GPT-5.5')
  })

  it('falls back to the raw model id as the label when the model has no catalog entry', async () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: 'sk-ant-oat01-test-token-long-enough-here', GHOSTED_HOUSE_MODEL: 'claude-mystery-9' })
    const res = GET()
    const body = (await res.json()) as { house?: { label: string; model: string } }
    expect(body.house?.model).toBe('claude-mystery-9')
    expect(body.house?.label).toBe('claude-mystery-9')
  })
})
