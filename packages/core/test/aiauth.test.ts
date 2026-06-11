import { describe, it, expect } from 'vitest'
import { validateAIAuth, maskKey, describeAIAuth, modelForAuth, type AIAuth } from '../src/index'

describe('validateAIAuth', () => {
  it('local CLI login needs no key for Claude or Codex subscriptions', () => {
    expect(validateAIAuth({ provider: 'anthropic', method: 'local_cli' }).ok).toBe(true)
    expect(validateAIAuth({ provider: 'codex', method: 'local_cli' }).ok).toBe(true)
  })

  it('accepts a Claude subscription OAuth token (sk-ant-oat…)', () => {
    const auth: AIAuth = {
      provider: 'anthropic',
      method: 'oauth_token',
      key: 'sk-ant-oat01-' + 'x'.repeat(40),
    }
    expect(validateAIAuth(auth).ok).toBe(true)
  })

  it('rejects an API key pasted into the subscription-token slot', () => {
    const r = validateAIAuth({
      provider: 'anthropic',
      method: 'oauth_token',
      key: 'sk-ant-api03-' + 'x'.repeat(40),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/setup-token/)
  })

  it('accepts an Anthropic API key (sk-ant-…)', () => {
    expect(
      validateAIAuth({ provider: 'anthropic', method: 'api_key', key: 'sk-ant-api03-' + 'x'.repeat(40) }).ok,
    ).toBe(true)
  })

  it('accepts an OpenAI API key (sk-…)', () => {
    expect(validateAIAuth({ provider: 'openai', method: 'api_key', key: 'sk-' + 'x'.repeat(40) }).ok).toBe(true)
  })

  it('rejects Codex pasted keys because subscription support is local CLI only', () => {
    const r = validateAIAuth({ provider: 'codex', method: 'api_key', key: 'sk-' + 'x'.repeat(40) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/local Codex CLI/i)
  })

  it('validates model/provider compatibility and falls back to provider defaults', () => {
    expect(validateAIAuth({ provider: 'codex', method: 'local_cli', model: 'gpt-5-mini' }).ok).toBe(true)
    expect(validateAIAuth({ provider: 'codex', method: 'local_cli', model: 'claude-sonnet-4-6' }).ok).toBe(false)
    expect(validateAIAuth({ provider: 'anthropic', method: 'local_cli', model: 'claude-newly-released-9' }).ok).toBe(true)
    expect(modelForAuth({ provider: 'codex', method: 'local_cli' })).toBe('gpt-5-mini')
  })

  it('rejects empty, short, or whitespace-padded keys', () => {
    for (const key of ['', 'sk-short', '  sk-ant-api03-' + 'x'.repeat(40)]) {
      expect(validateAIAuth({ provider: 'anthropic', method: 'api_key', key }).ok).toBe(false)
    }
  })

  it('rejects an OpenAI key in the Anthropic slot and vice versa', () => {
    expect(validateAIAuth({ provider: 'anthropic', method: 'api_key', key: 'sk-proj-' + 'x'.repeat(40) }).ok).toBe(false)
    expect(validateAIAuth({ provider: 'openai', method: 'oauth_token', key: 'sk-ant-oat01-' + 'x'.repeat(40) }).ok).toBe(false)
  })
})

describe('maskKey never exposes more than the tail', () => {
  it('shows prefix and last 4 only', () => {
    const masked = maskKey('sk-ant-api03-' + 'x'.repeat(40) + 'WXYZ')
    expect(masked).toBe('sk-ant-…WXYZ')
    expect(masked).not.toContain('x'.repeat(8))
  })
  it('handles short strings without throwing', () => {
    expect(maskKey('abc')).toBe('…')
  })
})

describe('describeAIAuth', () => {
  it('names each connection humanly', () => {
    expect(describeAIAuth({ provider: 'anthropic', method: 'local_cli' })).toMatch(/Claude Code login/i)
    expect(describeAIAuth({ provider: 'anthropic', method: 'oauth_token', key: 'sk-ant-oat01-x' })).toMatch(/subscription/i)
    expect(describeAIAuth({ provider: 'openai', method: 'api_key', key: 'sk-x' })).toMatch(/OpenAI/i)
    expect(describeAIAuth({ provider: 'codex', method: 'local_cli' })).toMatch(/Codex CLI/i)
  })
})
