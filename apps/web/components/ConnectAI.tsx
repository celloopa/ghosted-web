'use client'

import { useEffect, useState } from 'react'
import {
  DEFAULT_MODEL_BY_PROVIDER,
  FALLBACK_MODEL_CATALOG,
  validateAIAuth,
  type AIAuth,
  type AIAuthMethod,
  type AIProvider,
  type ModelCatalogEntry,
} from '@ghosted/core'

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
    id: 'codex-cli',
    provider: 'codex',
    method: 'local_cli',
    label: 'Codex on this machine',
    detail: 'Uses your local Codex CLI login and subscription. Recommended if you want Codex as the applying agent while staying local.',
    needsKey: false,
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

function dollarsPerMTok(price?: number) {
  return price === undefined ? 'unknown' : `$${(price * 1_000_000).toFixed(price * 1_000_000 < 1 ? 2 : 0)}/1M`
}

export function ConnectAI({ onConnect, current }: { onConnect: (auth: AIAuth) => void | Promise<void>; current?: AIAuth | null }) {
  const [selected, setSelected] = useState<string | null>(
    current ? OPTIONS.find((o) => o.provider === current.provider && o.method === current.method)?.id ?? null : null,
  )
  const [key, setKey] = useState('')
  const [model, setModel] = useState(current?.model ?? (current ? DEFAULT_MODEL_BY_PROVIDER[current.provider] : ''))
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>(FALLBACK_MODEL_CATALOG)
  const [catalogSource, setCatalogSource] = useState('fallback')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void fetch('/api/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { models?: ModelCatalogEntry[]; refreshed?: number } | null) => {
        if (!alive || !data?.models) return
        setCatalog(data.models)
        setCatalogSource(data.refreshed && data.refreshed > 0 ? `OpenRouter refreshed ${data.refreshed}` : 'fallback')
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const option = OPTIONS.find((o) => o.id === selected)
  const modelOptions = option ? catalog.filter((m) => m.provider === option.provider) : []
  const selectedModel = option ? model || DEFAULT_MODEL_BY_PROVIDER[option.provider] : ''

  async function submit() {
    if (!option) return
    const auth: AIAuth = { provider: option.provider, method: option.method, model: selectedModel }
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
              setModel(DEFAULT_MODEL_BY_PROVIDER[o.provider])
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

      {option && modelOptions.length > 0 && (
        <label className="field">
          <span className="field-label">Model</span>
          <select className="input" value={selectedModel} onChange={(e) => setModel(e.target.value)}>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.modelClass}
              </option>
            ))}
          </select>
          {(() => {
            const picked = modelOptions.find((m) => m.id === selectedModel)
            return (
              <span className="chip-examples">
                {picked?.detail ?? catalogSource}
                {picked?.pricing && ` · est. ${dollarsPerMTok(picked.pricing.input)} in / ${dollarsPerMTok(picked.pricing.output)} out`}
              </span>
            )
          })()}
        </label>
      )}

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
