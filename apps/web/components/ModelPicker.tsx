'use client'

import { useEffect, useState } from 'react'
import { FALLBACK_MODEL_CATALOG, type ModelCatalogEntry } from '@ghosted/core'
import { useAIAuth } from '../lib/useAIAuth'
import { useHostedConfig } from '../lib/useHosted'
import { useModelChoice } from '../lib/useModelChoice'
import { buildPickerEntries } from '../lib/pickerModels'

interface ModelsResponse {
  models: ModelCatalogEntry[]
  available?: { claude_cli: boolean; codex_cli: boolean }
}

/**
 * Compact model picker that groups options by provider (Claude / OpenAI).
 *
 * - Entries not runnable with the current connections are NOT rendered at all.
 * - Duplicates are merged: prefers runnable entries, then the local fallback
 *   catalog over OpenRouter entries (curated pricing). Deduplication covers
 *   both model-id collisions and display-label collisions within a group.
 * - When a provider group ends up empty, renders a single disabled placeholder.
 * - When both groups are empty, renders a single "no AI connection" option.
 * - Persists the choice in localStorage via useModelChoice.
 */
export function ModelPicker() {
  const { auth } = useAIAuth()
  const { hosted, house } = useHostedConfig()
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

  const opts = {
    claudeCli: available.claude_cli || (auth?.method === 'local_cli' && auth.provider === 'anthropic'),
    codexCli: available.codex_cli || (auth?.method === 'local_cli' && auth.provider === 'codex'),
    anthropicKey: auth?.provider === 'anthropic' && (auth.method === 'api_key' || auth.method === 'oauth_token'),
    openaiKey: auth?.provider === 'openai' && auth.method === 'api_key',
  }

  const { claudeEntries, openaiEntries } = buildPickerEntries(catalog, opts)

  // Pick a sensible default: prefer a standard-class Claude, then any runnable entry.
  const firstRunnable =
    claudeEntries.find((e) => {
      const m = catalog.find((c) => c.id === e.id && c.provider === 'anthropic')
      return m?.modelClass === 'standard'
    }) ??
    claudeEntries[0] ??
    openaiEntries[0]

  const allEntries = [...claudeEntries, ...openaiEntries]

  // Pass all current entries to useModelChoice so it can reconcile a stale
  // stored id against what is actually pickable today.
  const { model, setModel } = useModelChoice(firstRunnable?.id ?? '', allEntries)

  const bothEmpty = claudeEntries.length === 0 && openaiEntries.length === 0

  // Riding the shared account with no connection of your own: there is
  // nothing to pick — the house model is fixed. Show a read-only indicator
  // instead of a select that implies a choice that isn't actually offered.
  if (hosted && !auth) {
    return (
      <div className="field house-chip">
        <span className="field-label">Model</span>
        <span
          className="house-chip-body mono"
          title="generation runs on the shared account. connect your own key in settings to pick a model."
        >
          shared account · {house?.label ?? 'configured'}
        </span>
      </div>
    )
  }

  return (
    <div>
      <label className="field">
        <span className="field-label">Model</span>
        <select
          className="input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {bothEmpty ? (
            <option value="" disabled>
              No AI connection — connect Claude CLI, Codex CLI, or an API key
            </option>
          ) : (
            <>
              <optgroup label="Claude">
                {claudeEntries.length > 0 ? (
                  claudeEntries.map((e) => (
                    <option key={e.key} value={e.id}>
                      {e.label}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    Claude — connect Claude CLI or an Anthropic API key
                  </option>
                )}
              </optgroup>
              <optgroup label="OpenAI">
                {openaiEntries.length > 0 ? (
                  openaiEntries.map((e) => (
                    <option key={e.key} value={e.id}>
                      {e.label}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    OpenAI — connect Codex CLI or an OpenAI API key
                  </option>
                )}
              </optgroup>
            </>
          )}
        </select>
      </label>
    </div>
  )
}
