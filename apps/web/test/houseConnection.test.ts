/**
 * Unit tests for houseConnection / resolveConnection.
 *
 * Environment variables are patched per-test and restored after each one so
 * tests do not bleed into each other.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { houseConnection, resolveConnection } from '../lib/server/houseConnection'
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
