'use client'

import { useEffect, useState } from 'react'
import type { PickerEntry } from './pickerModels'

const STORAGE_KEY = 'ghosted.model.v1'

/**
 * Strip provider prefix (label style "Anthropic: " or id style "anthropic/"),
 * lowercase, remove every non-alphanumeric character, and collapse whitespace.
 * This mirrors the normalizeIdentity logic in pickerModels.ts so that stored ids
 * in either form (slash or dash, prefixed or bare) resolve to the same key.
 */
const PROVIDER_PREFIX_RE = /^(anthropic|openai|google|meta|x-?ai)[:/]\s*/i

function normalizeForMatch(s: string): string {
  return s
    .replace(PROVIDER_PREFIX_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Pure helper: given a stored model id (or undefined) and the current list of
 * pickable entries, return the id that should actually be used.
 *
 * Rules:
 *   - No entries → undefined (nothing to pick).
 *   - Stored id is an exact member → return it unchanged.
 *   - Stored id normalizes to the same token as an entry id → return that
 *     entry's id (handles openrouter "anthropic/claude-sonnet-4.6" vs fallback
 *     "claude-sonnet-4-6" after dedupe removes one of the two).
 *   - Otherwise → return the first entry's id (reset stale choice).
 */
export function reconcileModelChoice(
  stored: string | undefined,
  entries: PickerEntry[],
): string | undefined {
  if (entries.length === 0) return undefined

  if (stored) {
    // Exact match wins immediately.
    if (entries.some((e) => e.id === stored)) return stored

    // Normalized match — e.g. stored='anthropic/claude-sonnet-4.6', entry.id='claude-sonnet-4-6'
    const normStored = normalizeForMatch(stored)
    const match = entries.find((e) => normalizeForMatch(e.id) === normStored)
    if (match) return match.id
  }

  // Stale or absent — reset to the first pickable entry.
  return entries[0]!.id
}

export interface ModelChoice {
  model: string
  setModel: (id: string) => void
}

/**
 * Persists the user's chosen model id in localStorage.
 * Accepts the current list of pickable entries so it can reconcile a stale
 * stored value against what is actually available. When entries are provided
 * and the stored choice is not among them, the hook resets to the first entry
 * and persists the new value. The returned model is always a currently-pickable
 * id (or '' when entries is empty / not yet known).
 */
export function useModelChoice(defaultModel = '', entries?: PickerEntry[]): ModelChoice {
  const [model, setModelState] = useState<string>(() => {
    if (typeof window === 'undefined') return defaultModel
    try {
      return localStorage.getItem(STORAGE_KEY) ?? defaultModel
    } catch {
      return defaultModel
    }
  })

  // Reconcile the stored model with the pickable entries once entries are known.
  useEffect(() => {
    if (!entries || entries.length === 0) return
    const reconciled = reconcileModelChoice(model || undefined, entries)
    if (reconciled && reconciled !== model) {
      try {
        localStorage.setItem(STORAGE_KEY, reconciled)
      } catch {
        // localStorage unavailable
      }
      setModelState(reconciled)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  // Keep in sync if another tab writes.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setModelState(e.newValue ?? defaultModel)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [defaultModel])

  function setModel(id: string) {
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // localStorage unavailable (private browsing quota exhausted, etc.)
    }
    setModelState(id)
  }

  return { model, setModel }
}
