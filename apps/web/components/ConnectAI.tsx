'use client'

import { useState } from 'react'
import { validateAIAuth, type AIAuth, type AIAuthMethod, type AIProvider } from '@ghosted/core'

// No humor here — auth is one of the surfaces where the voice goes plain
// (decision interview §2).
const OPTIONS: {
  id: string
  provider: AIProvider
  method: AIAuthMethod
  label: string
  detail: string
  needsKey: boolean
  recommended?: boolean
}[] = [
  {
    id: 'cli',
    provider: 'anthropic',
    method: 'local_cli',
    label: 'Claude Code on this machine',
    detail: 'Uses your existing claude login and Pro/Max subscription. Nothing to paste. Works while the app runs locally.',
    needsKey: false,
    recommended: true,
  },
  {
    id: 'oat',
    provider: 'anthropic',
    method: 'oauth_token',
    label: 'Claude subscription token',
    detail: 'Run `claude setup-token` in a terminal and paste the sk-ant-oat… token. Rides your subscription, works anywhere.',
    needsKey: true,
  },
  {
    id: 'ant-key',
    provider: 'anthropic',
    method: 'api_key',
    label: 'Anthropic API key',
    detail: 'sk-ant-… key from platform.claude.com. Usage-billed, separate from any subscription.',
    needsKey: true,
  },
  {
    id: 'oai-key',
    provider: 'openai',
    method: 'api_key',
    label: 'OpenAI API key',
    detail: 'sk-… key from platform.openai.com. Note: ChatGPT subscriptions cannot be used by other apps — for OpenAI, an API key is the only path.',
    needsKey: true,
  },
]

export function ConnectAI({ onConnect, current }: { onConnect: (auth: AIAuth) => void | Promise<void>; current?: AIAuth | null }) {
  const [selected, setSelected] = useState<string | null>(
    current ? OPTIONS.find((o) => o.provider === current.provider && o.method === current.method)?.id ?? null : null,
  )
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const option = OPTIONS.find((o) => o.id === selected)

  async function submit() {
    if (!option) return
    const auth: AIAuth = { provider: option.provider, method: option.method }
    if (option.needsKey) auth.key = key.trim()
    const result = validateAIAuth(auth)
    if (!result.ok) return setError(result.message)
    setError(null)
    await onConnect(auth)
  }

  return (
    <div>
      <div className="connect-options">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`chip connect-option${selected === o.id ? ' chip-selected' : ''}`}
            onClick={() => {
              setSelected(o.id)
              setError(null)
            }}
          >
            <span>
              {o.label}
              {o.recommended && <span className="badge badge-followup connect-rec">recommended</span>}
            </span>
            <span className="chip-examples">{o.detail}</span>
          </button>
        ))}
      </div>

      {option?.needsKey && (
        <label className="field">
          <span className="field-label">
            {option.method === 'oauth_token' ? 'Token' : 'API key'}
          </span>
          <input
            className="input mono"
            type="password"
            placeholder={option.method === 'oauth_token' ? 'sk-ant-oat…' : option.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
        </label>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <p className="dim small">
        Stored only in this browser, sent nowhere except your provider. When accounts arrive, connections move
        server-side and encrypted.
      </p>

      <button className="btn btn-primary" disabled={!option} onClick={submit}>
        Connect
      </button>
    </div>
  )
}
