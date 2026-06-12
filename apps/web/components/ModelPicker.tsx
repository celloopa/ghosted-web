'use client'

import { useEffect, useState } from 'react'
import { FALLBACK_MODEL_CATALOG, runnableWith, type ModelCatalogEntry } from '@ghosted/core'
import { useAIAuth } from '../lib/useAIAuth'
import { useModelChoice } from '../lib/useModelChoice'

interface ModelsResponse {
  models: ModelCatalogEntry[]
  available?: { claude_cli: boolean; codex_cli: boolean }
}

/**
 * Compact model picker that groups options by provider (Claude / OpenAI) and
 * greys out entries that cannot be run with the current auth + CLI availability.
 * Persists the choice in localStorage via useModelChoice.
 */
export function ModelPicker() {
  const { auth } = useAIAuth()
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>(FALLBACK_MODEL_CATALOG)
  const [available, setAvailable] = useState<{ claude_cli: boolean; codex_cli: boolean }>({
    claude_cli: false,
    codex_cli: false,
  })

  useEffect(() => {
    let alive = true
    void fetch('/api/models')
      .then((r) => (r.ok ? (r.json() as Promise<ModelsResponse>) : null))
      .then((data) => {
        if (!alive || !data) return
        if (data.models?.length) setCatalog(data.models)
        if (data.available) setAvailable(data.available)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const opts: { claudeCli: boolean; codexCli: boolean; anthropicKey: boolean; openaiKey: boolean } = {
    claudeCli: available.claude_cli || auth?.method === 'local_cli' && auth.provider === 'anthropic',
    codexCli: available.codex_cli || auth?.method === 'local_cli' && auth.provider === 'codex',
    anthropicKey: auth?.provider === 'anthropic' && (auth.method === 'api_key' || auth.method === 'oauth_token'),
    openaiKey: auth?.provider === 'openai' && auth.method === 'api_key',
  }

  const anthropicModels = catalog.filter((m) => m.provider === 'anthropic')
  const openaiModels = catalog.filter((m) => m.provider === 'openai' || m.provider === 'codex')

  // Pick a sensible default: prefer a sonnet-class Claude if Claude CLI is present.
  const firstRunnable =
    catalog.find((m) => runnableWith(m, opts) && m.provider === 'anthropic' && m.modelClass === 'standard') ??
    catalog.find((m) => runnableWith(m, opts)) ??
    catalog[0]

  const { model, setModel } = useModelChoice(firstRunnable?.id ?? '')

  const claudeUnavailable = !opts.claudeCli && !opts.anthropicKey
  const openaiUnavailable = !opts.codexCli && !opts.openaiKey

  return (
    <div>
      <label className="field">
        <span className="field-label">Model</span>
        <select
          className="input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {anthropicModels.length > 0 && (
            <optgroup label="Claude">
              {anthropicModels.map((m) => {
                const runnable = runnableWith(m, opts)
                return (
                  <option key={`${m.provider}:${m.id}`} value={m.id} disabled={!runnable}>
                    {m.label}{!runnable ? ' (unavailable)' : ''}
                  </option>
                )
              })}
            </optgroup>
          )}
          {openaiModels.length > 0 && (
            <optgroup label="OpenAI">
              {openaiModels.map((m) => {
                const runnable = runnableWith(m, opts)
                return (
                  <option key={`${m.provider}:${m.id}`} value={m.id} disabled={!runnable}>
                    {m.label}{!runnable ? ' (unavailable)' : ''}
                  </option>
                )
              })}
            </optgroup>
          )}
        </select>
      </label>

      {claudeUnavailable && (
        <p className="dim small">
          Claude CLI not detected and no Anthropic key connected — Claude models unavailable.
        </p>
      )}
      {openaiUnavailable && (
        <p className="dim small">
          codex CLI not detected — OpenAI models hidden.
        </p>
      )}
    </div>
  )
}
