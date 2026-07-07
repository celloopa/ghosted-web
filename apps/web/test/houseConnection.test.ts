/**
 * Unit tests for houseConnection / resolveConnection.
 *
 * Environment variables are patched per-test and restored after each one so
 * tests do not bleed into each other.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { houseConnection, resolveConnection, isCliBasedAuth, isHouseConfigured, isForbiddenCliBypass } from '../lib/server/houseConnection'
import type { AIAuth } from '@ghosted/core'

// Save originals so we can restore them.
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

function resetEnv() {
  // Remove any keys we might have added.
  for (const k of ['GHOSTED_HOUSE_TOKEN', 'GHOSTED_HOUSE_PROVIDER', 'GHOSTED_HOUSE_MODEL']) {
    delete process.env[k]
  }
  // Restore original values.
  Object.assign(process.env, ORIG_ENV)
}

beforeEach(() => {
  // Ensure no house token leaks from env between tests.
  delete process.env.GHOSTED_HOUSE_TOKEN
  delete process.env.GHOSTED_HOUSE_PROVIDER
  delete process.env.GHOSTED_HOUSE_MODEL
})

afterEach(() => {
  resetEnv()
})

// ---------------------------------------------------------------------------
// houseConnection
// ---------------------------------------------------------------------------

describe('houseConnection', () => {
  it('returns null when GHOSTED_HOUSE_TOKEN is unset', () => {
    expect(houseConnection()).toBeNull()
  })

  it('builds an AIAuth from env vars with defaults', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: 'sk-ant-oat01-test-token-long-enough-here' })
    const auth = houseConnection()
    expect(auth).not.toBeNull()
    expect(auth?.provider).toBe('anthropic')
    expect(auth?.method).toBe('oauth_token')
    expect(auth?.key).toBe('sk-ant-oat01-test-token-long-enough-here')
    expect(auth?.model).toBe('claude-sonnet-4-6')
  })

  it('respects GHOSTED_HOUSE_MODEL override', () => {
    setEnv({
      GHOSTED_HOUSE_TOKEN: 'sk-ant-oat01-test-token-long-enough-here',
      GHOSTED_HOUSE_MODEL: 'claude-haiku-4-5',
    })
    const auth = houseConnection()
    expect(auth?.model).toBe('claude-haiku-4-5')
  })

  it('codex provider + no token → returns a codex local_cli auth with the default model', () => {
    setEnv({ GHOSTED_HOUSE_PROVIDER: 'codex' })
    const auth = houseConnection()
    expect(auth).toEqual({ provider: 'codex', method: 'local_cli', model: 'gpt-5.5' })
  })

  it('codex provider + valid codex model override', () => {
    setEnv({ GHOSTED_HOUSE_PROVIDER: 'codex', GHOSTED_HOUSE_MODEL: 'gpt-5-mini' })
    const auth = houseConnection()
    expect(auth?.model).toBe('gpt-5-mini')
  })

  it('codex provider + a non-codex model value falls back to the default codex model', () => {
    setEnv({ GHOSTED_HOUSE_PROVIDER: 'codex', GHOSTED_HOUSE_MODEL: 'claude-sonnet-4-6' })
    const auth = houseConnection()
    expect(auth?.model).toBe('gpt-5.5')
  })
})

// ---------------------------------------------------------------------------
// isHouseConfigured
// ---------------------------------------------------------------------------

describe('isHouseConfigured', () => {
  it('is true when the codex house is configured', () => {
    setEnv({ GHOSTED_HOUSE_PROVIDER: 'codex' })
    expect(isHouseConfigured()).toBe(true)
  })

  it('is true when the anthropic house token is set', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: 'sk-ant-oat01-test-token-long-enough-here' })
    expect(isHouseConfigured()).toBe(true)
  })

  it('is false when neither house env is set', () => {
    expect(isHouseConfigured()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveConnection
// ---------------------------------------------------------------------------

describe('resolveConnection', () => {
  const VALID_HOUSE_TOKEN = 'sk-ant-oat01-test-house-token-xxxx'

  const validRequestAuth: AIAuth = {
    provider: 'anthropic',
    method: 'oauth_token',
    key: 'sk-ant-oat01-request-token-long-x',
  }

  const invalidRequestAuth: AIAuth = {
    provider: 'anthropic',
    method: 'oauth_token',
    key: 'short', // too short → validateAIAuth will reject
  }

  it('uses the request auth when it is valid (usingHouse: false)', () => {
    // House token is also set — request auth should win.
    setEnv({ GHOSTED_HOUSE_TOKEN: VALID_HOUSE_TOKEN })
    const result = resolveConnection(validRequestAuth)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(false)
    expect(result.auth.key).toBe(validRequestAuth.key)
  })

  it('falls back to house account when no request auth provided', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: VALID_HOUSE_TOKEN })
    const result = resolveConnection(undefined)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(true)
    expect(result.auth.key).toBe(VALID_HOUSE_TOKEN)
  })

  it('falls back to house account when request auth is invalid', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: VALID_HOUSE_TOKEN })
    const result = resolveConnection(invalidRequestAuth)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(true)
    expect(result.auth.key).toBe(VALID_HOUSE_TOKEN)
  })

  it('returns an error when neither request auth nor house account is available', () => {
    // No house token in env.
    const result = resolveConnection(undefined)
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toMatch(/no AI connection/)
  })

  it('returns an error when request auth is invalid and house token is unset', () => {
    const result = resolveConnection(invalidRequestAuth)
    expect('error' in result).toBe(true)
  })

  it('falls back to the codex house when configured and no request auth is provided', () => {
    setEnv({ GHOSTED_HOUSE_PROVIDER: 'codex' })
    const result = resolveConnection(undefined)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(true)
    expect(result.auth.provider).toBe('codex')
  })

  it('does not include the house token in error responses', () => {
    // Even when both fail, the error string should not echo back a token.
    setEnv({ GHOSTED_HOUSE_TOKEN: 'sk-ant-oat01-should-not-appear' })
    // Force house to fail by providing a bad provider.
    setEnv({ GHOSTED_HOUSE_PROVIDER: 'openai' as string }) // openai + oauth_token → invalid
    const result = resolveConnection(undefined)
    if (!('error' in result)) return
    expect(result.error).not.toContain('sk-ant-oat01-should-not-appear')
  })
})

// ---------------------------------------------------------------------------
// isCliBasedAuth
// ---------------------------------------------------------------------------

describe('isCliBasedAuth', () => {
  it('returns true for anthropic/local_cli', () => {
    const auth: AIAuth = { provider: 'anthropic', method: 'local_cli' }
    expect(isCliBasedAuth(auth)).toBe(true)
  })

  it('returns true for codex/local_cli', () => {
    const auth: AIAuth = { provider: 'codex', method: 'local_cli' }
    expect(isCliBasedAuth(auth)).toBe(true)
  })

  it('returns true for codex/api_key (codex has no non-CLI path)', () => {
    // codex provider always requires the CLI binary
    const auth: AIAuth = { provider: 'codex', method: 'api_key' }
    expect(isCliBasedAuth(auth)).toBe(true)
  })

  it('returns false for anthropic/oauth_token', () => {
    const auth: AIAuth = { provider: 'anthropic', method: 'oauth_token', key: 'sk-ant-oat01-x' }
    expect(isCliBasedAuth(auth)).toBe(false)
  })

  it('returns false for anthropic/api_key', () => {
    const auth: AIAuth = { provider: 'anthropic', method: 'api_key', key: 'sk-ant-key123' }
    expect(isCliBasedAuth(auth)).toBe(false)
  })

  it('returns false for openai/api_key', () => {
    const auth: AIAuth = { provider: 'openai', method: 'api_key', key: 'sk-openai-key123' }
    expect(isCliBasedAuth(auth)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveConnection — CLI-based auth fallback logic (Fix 1)
// ---------------------------------------------------------------------------

describe('resolveConnection — CLI fallback', () => {
  const VALID_HOUSE_TOKEN = 'sk-ant-oat01-test-house-token-xxxx'

  const localCliAuth: AIAuth = {
    provider: 'anthropic',
    method: 'local_cli',
  }

  const codexAuth: AIAuth = {
    provider: 'codex',
    method: 'local_cli',
  }

  const apiKeyAuth: AIAuth = {
    provider: 'anthropic',
    method: 'api_key',
    key: 'sk-ant-apikey-long-enough-here-xxx',
  }

  const oauthAuth: AIAuth = {
    provider: 'anthropic',
    method: 'oauth_token',
    key: 'sk-ant-oat01-caller-token-long-xx',
  }

  it('local_cli + house set → returns house (usingHouse true)', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: VALID_HOUSE_TOKEN })
    const result = resolveConnection(localCliAuth)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(true)
    expect(result.auth.key).toBe(VALID_HOUSE_TOKEN)
  })

  it('codex + house set → returns house (usingHouse true)', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: VALID_HOUSE_TOKEN })
    const result = resolveConnection(codexAuth)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(true)
    expect(result.auth.key).toBe(VALID_HOUSE_TOKEN)
  })

  it('local_cli + NO house → returns the local_cli auth as-is (local-dev path)', () => {
    // No GHOSTED_HOUSE_TOKEN in env — owner's local machine with real claude CLI.
    const result = resolveConnection(localCliAuth)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(false)
    expect(result.auth.method).toBe('local_cli')
  })

  it('api_key anthropic + house set → returns the caller api_key (usingHouse false)', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: VALID_HOUSE_TOKEN })
    const result = resolveConnection(apiKeyAuth)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(false)
    expect(result.auth.key).toBe(apiKeyAuth.key)
  })

  it('oauth_token + house set → returns the caller oauth_token (usingHouse false)', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: VALID_HOUSE_TOKEN })
    const result = resolveConnection(oauthAuth)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(false)
    expect(result.auth.key).toBe(oauthAuth.key)
  })

  it('no auth + house set → house (usingHouse true)', () => {
    setEnv({ GHOSTED_HOUSE_TOKEN: VALID_HOUSE_TOKEN })
    const result = resolveConnection(undefined)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.usingHouse).toBe(true)
    expect(result.auth.key).toBe(VALID_HOUSE_TOKEN)
  })
})

// ---------------------------------------------------------------------------
// isForbiddenCliBypass — the /api/generate security guard predicate (Change 1b)
// ---------------------------------------------------------------------------

describe('isForbiddenCliBypass', () => {
  it('BYOK request (usingHouse false) routed to codex_cli → forbidden', () => {
    expect(isForbiddenCliBypass(false, 'codex_cli')).toBe(true)
  })

  it('BYOK request (usingHouse false) routed to claude_cli → forbidden', () => {
    expect(isForbiddenCliBypass(false, 'claude_cli')).toBe(true)
  })

  it('house request (usingHouse true) routed to codex_cli → allowed (that IS the house path)', () => {
    expect(isForbiddenCliBypass(true, 'codex_cli')).toBe(false)
  })

  it('house request (usingHouse true) routed to claude_cli → allowed', () => {
    expect(isForbiddenCliBypass(true, 'claude_cli')).toBe(false)
  })

  it('BYOK request routed to anthropic_api → allowed (not a CLI route)', () => {
    expect(isForbiddenCliBypass(false, 'anthropic_api')).toBe(false)
  })

  it('BYOK request routed to openai_api → allowed (not a CLI route)', () => {
    expect(isForbiddenCliBypass(false, 'openai_api')).toBe(false)
  })

  it('BYOK request routed to legacy → allowed (legacy path predates the house gate)', () => {
    expect(isForbiddenCliBypass(false, 'legacy')).toBe(false)
  })
})
