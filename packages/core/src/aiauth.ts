// AI connection for the local apply-flow agent. Honest paths:
//  - anthropic/local_cli: this machine's Claude Code login (subscription)
//  - codex/local_cli: this machine's Codex CLI login (subscription)
//  - anthropic/oauth_token: `claude setup-token` subscription token
//  - anthropic|openai/api_key: usage-billed API key
// ChatGPT subscriptions cannot be used by third-party apps; for OpenAI API
// calls, an API key is the only path. Codex subscription use is via CLI only.

export type AIProvider = 'anthropic' | 'openai' | 'codex'
export type AIAuthMethod = 'local_cli' | 'oauth_token' | 'api_key'

export type AIModelClass = 'small' | 'standard' | 'deep'

export interface AIModelOption {
  id: string
  label: string
  provider: AIProvider
  modelClass: AIModelClass
  detail: string
}

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    modelClass: 'standard',
    detail: 'Default Claude choice. Enough reasoning for variations without using the top model.',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    modelClass: 'small',
    detail: 'Cheaper/faster draft pass. Use when deterministic scoring already did most of the work.',
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    provider: 'openai',
    modelClass: 'small',
    detail: 'Small OpenAI API option for prose variations.',
  },
  {
    id: 'gpt-5.1',
    label: 'GPT-5.1',
    provider: 'openai',
    modelClass: 'standard',
    detail: 'OpenAI API option when you want a stronger prose pass.',
  },
  {
    id: 'gpt-5-mini',
    label: 'Codex with GPT-5 mini',
    provider: 'codex',
    modelClass: 'small',
    detail: 'Recommended local Codex subscription option for this app: lower think effort, bounded prose only.',
  },
  {
    id: 'gpt-5.5',
    label: 'Codex with GPT-5.5',
    provider: 'codex',
    modelClass: 'standard',
    detail: 'Local Codex CLI option for harder application prompts; matches Cello’s current Codex config.',
  },
]

export const DEFAULT_MODEL_BY_PROVIDER: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5-mini',
  codex: 'gpt-5-mini',
}

export interface AIAuth {
  provider: AIProvider
  method: AIAuthMethod
  key?: string
  /** User preference only. The API route still validates provider compatibility. */
  model?: string
  added_at?: string
}

export type AIAuthValidation = { ok: true } | { ok: false; message: string }

export function modelForAuth(auth: AIAuth): string {
  const picked = auth.model && AI_MODEL_OPTIONS.some((m) => m.provider === auth.provider && m.id === auth.model)
  return picked ? auth.model! : DEFAULT_MODEL_BY_PROVIDER[auth.provider]
}

export function validateAIAuth(auth: AIAuth): AIAuthValidation {
  if (auth.model) {
    const idExists = AI_MODEL_OPTIONS.some((m) => m.id === auth.model)
    const providerMatch = AI_MODEL_OPTIONS.some((m) => m.provider === auth.provider && m.id === auth.model)
    // Unknown IDs are allowed so the refreshable model catalog can pick up
    // newly released Anthropic/OpenAI models before this package is updated.
    if (idExists && !providerMatch) return { ok: false, message: 'That model does not match the selected provider.' }
  }

  if (auth.method === 'local_cli') {
    if (auth.provider === 'anthropic' || auth.provider === 'codex') return { ok: true }
    return { ok: false, message: 'CLI login is only available for Claude Code or Codex.' }
  }

  if (auth.provider === 'codex') {
    return { ok: false, message: 'Codex subscription support uses the local Codex CLI, not pasted keys.' }
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
  const model = modelForAuth(auth)
  if (auth.provider === 'codex') return `Codex CLI — ${model}`
  if (auth.method === 'local_cli') return `Claude — this machine's Claude Code login (${model})`
  if (auth.method === 'oauth_token') return `Claude — subscription token (${maskKey(auth.key ?? '')}, ${model})`
  return auth.provider === 'anthropic'
    ? `Claude — API key (${maskKey(auth.key ?? '')}, ${model})`
    : `OpenAI — API key (${maskKey(auth.key ?? '')}, ${model})`
}
