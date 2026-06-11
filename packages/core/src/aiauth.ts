// AI connection for the apply-flow agent. Three honest paths:
//  - anthropic/local_cli:   ride this machine's Claude Code login (dev) —
//    the Agent SDK resolves it automatically; uses the Pro/Max subscription
//  - anthropic/oauth_token: `claude setup-token` → sk-ant-oat… (subscription,
//    works off-machine)
//  - anthropic|openai/api_key: usage-billed API key
// ChatGPT subscriptions cannot be used by third-party apps — for OpenAI an
// API key is the only path, and the UI says so plainly.

export type AIProvider = 'anthropic' | 'openai'
export type AIAuthMethod = 'local_cli' | 'oauth_token' | 'api_key'

export interface AIAuth {
  provider: AIProvider
  method: AIAuthMethod
  key?: string
  added_at?: string
}

export type AIAuthValidation = { ok: true } | { ok: false; message: string }

export function validateAIAuth(auth: AIAuth): AIAuthValidation {
  if (auth.method === 'local_cli') {
    return auth.provider === 'anthropic'
      ? { ok: true }
      : { ok: false, message: 'CLI login is a Claude-only option' }
  }

  const key = auth.key ?? ''
  if (key !== key.trim()) return { ok: false, message: 'Key has leading or trailing whitespace.' }
  if (key.length < 24) return { ok: false, message: 'That looks too short to be a key.' }

  if (auth.method === 'oauth_token') {
    if (auth.provider !== 'anthropic') return { ok: false, message: 'Subscription tokens are a Claude-only option.' }
    if (!key.startsWith('sk-ant-oat')) {
      return { ok: false, message: 'Subscription tokens start with sk-ant-oat — generate one with `claude setup-token`.' }
    }
    return { ok: true }
  }

  // api_key
  if (auth.provider === 'anthropic') {
    if (!key.startsWith('sk-ant-')) return { ok: false, message: 'Anthropic API keys start with sk-ant-.' }
    return { ok: true }
  }
  if (!key.startsWith('sk-') || key.startsWith('sk-ant-')) {
    return { ok: false, message: 'That does not look like an OpenAI key.' }
  }
  return { ok: true }
}

/** For display: provider prefix + last 4 characters, nothing else. */
export function maskKey(key: string): string {
  if (key.length < 12) return '…'
  const prefix = key.startsWith('sk-ant-') ? 'sk-ant-' : key.slice(0, 3)
  return `${prefix}…${key.slice(-4)}`
}

export function describeAIAuth(auth: AIAuth): string {
  if (auth.method === 'local_cli') return "Claude — this machine's Claude Code login"
  if (auth.method === 'oauth_token') return `Claude — subscription token (${maskKey(auth.key ?? '')})`
  return auth.provider === 'anthropic'
    ? `Claude — API key (${maskKey(auth.key ?? '')})`
    : `OpenAI — API key (${maskKey(auth.key ?? '')})`
}
