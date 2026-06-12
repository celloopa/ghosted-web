import { describe, it, expect } from 'vitest'
import { resolveRunner } from '../lib/server/resolveRunner'
import type { AIAuth } from '@ghosted/core'

const cliAuth: AIAuth = { provider: 'anthropic', method: 'local_cli' }
const apiKeyAuth: AIAuth = { provider: 'anthropic', method: 'api_key', key: 'sk-ant-verylongkeyhere12345' }
const oaiKeyAuth: AIAuth = { provider: 'openai', method: 'api_key', key: 'sk-verylongkeyhere12345678' }
const codexAuth: AIAuth = { provider: 'codex', method: 'local_cli' }

describe('resolveRunner', () => {
  it('no body model → legacy, preserves legacyModel', () => {
    const r = resolveRunner(undefined, cliAuth, undefined, 'claude-sonnet-4-6')
    expect(r.runner).toBe('legacy')
    expect(r.model).toBe('claude-sonnet-4-6')
  })

  it('empty string body model → legacy', () => {
    const r = resolveRunner('', cliAuth, undefined, 'claude-haiku-4-5')
    expect(r.runner).toBe('legacy')
    expect(r.model).toBe('claude-haiku-4-5')
  })

  it('openai model + both CLIs available → codex_cli (no openai key on auth)', () => {
    // When both CLIs are running but auth has no openai key, the only path for
    // an openai model is codex CLI.
    const r = resolveRunner('gpt-5-mini', cliAuth, 'openai', 'claude-sonnet-4-6')
    expect(r.runner).toBe('codex_cli')
    expect(r.model).toBe('gpt-5-mini')
  })

  it('openai model + openai key auth → openai_api', () => {
    const r = resolveRunner('gpt-5.5', oaiKeyAuth, 'openai', 'gpt-5-mini')
    expect(r.runner).toBe('openai_api')
    expect(r.model).toBe('gpt-5.5')
  })

  it('anthropic model + api_key auth → anthropic_api', () => {
    const r = resolveRunner('claude-haiku-4-5', apiKeyAuth, 'anthropic', 'claude-sonnet-4-6')
    expect(r.runner).toBe('anthropic_api')
    expect(r.model).toBe('claude-haiku-4-5')
  })

  it('anthropic model + local_cli auth → claude_cli regardless of key', () => {
    const r = resolveRunner('claude-opus-4-8', cliAuth, 'anthropic', 'claude-sonnet-4-6')
    expect(r.runner).toBe('claude_cli')
    expect(r.model).toBe('claude-opus-4-8')
  })

  it('codex provider model → codex_cli always', () => {
    const r = resolveRunner('gpt-5.5', codexAuth, 'codex', 'gpt-5-mini')
    expect(r.runner).toBe('codex_cli')
    expect(r.model).toBe('gpt-5.5')
  })

  it('unknown provider → error sentinel with 400-suitable message', () => {
    const r = resolveRunner('some-mystery-model', cliAuth, undefined, 'claude-sonnet-4-6')
    expect(r.runner).toBe('error')
    expect(r.errorMessage).toMatch(/unknown provider/)
  })

  it('model id with invalid chars → error sentinel', () => {
    const r = resolveRunner('model with spaces!', cliAuth, 'anthropic', 'claude-sonnet-4-6')
    expect(r.runner).toBe('error')
    expect(r.errorMessage).toMatch(/invalid characters/)
  })

  it('model id exactly 100 chars → accepted', () => {
    const longModel = 'a'.repeat(100)
    // No catalog entry → unknown provider, so error for unknown-provider reason not length
    const r = resolveRunner(longModel, cliAuth, 'anthropic', 'claude-sonnet-4-6')
    expect(r.runner).not.toBe('error') // valid chars, valid provider
  })

  it('model id 101 chars → error sentinel for invalid chars (length)', () => {
    const tooLong = 'a'.repeat(101)
    const r = resolveRunner(tooLong, cliAuth, 'anthropic', 'claude-sonnet-4-6')
    expect(r.runner).toBe('error')
  })
})
