'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ghosted.model.v1'

export interface ModelChoice {
  model: string
  setModel: (id: string) => void
}

/**
 * Persists the user's chosen model id in localStorage.
 * The default when nothing is stored is the empty string — callers should
 * treat '' as "no override" and fall back to the first runnable model.
 */
export function useModelChoice(defaultModel = ''): ModelChoice {
  const [model, setModelState] = useState<string>(() => {
    if (typeof window === 'undefined') return defaultModel
    try {
      return localStorage.getItem(STORAGE_KEY) ?? defaultModel
    } catch {
      return defaultModel
    }
  })

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
