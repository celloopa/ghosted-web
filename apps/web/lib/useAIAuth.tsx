'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AIAuth } from '@ghosted/core'
import { AIAuthRepo, LocalStorageAIAuthRepo } from './aiAuthRepo'

// Defaults to the real localStorage repo so the hook works without a
// provider (and survives stale-HMR layout chunks); the provider exists for
// test injection.
const AIAuthContext = createContext<AIAuthRepo>(new LocalStorageAIAuthRepo())

export function AIAuthProvider({ repo, children }: { repo?: AIAuthRepo; children: React.ReactNode }) {
  const value = useMemo(() => repo ?? new LocalStorageAIAuthRepo(), [repo])
  return <AIAuthContext.Provider value={value}>{children}</AIAuthContext.Provider>
}

export function useAIAuth() {
  const repo = useContext(AIAuthContext)

  const [auth, setAuth] = useState<AIAuth | null | undefined>(undefined) // undefined = loading

  useEffect(() => {
    void repo.load().then((a) => setAuth(a))
  }, [repo])

  const connect = useCallback(
    async (next: AIAuth) => {
      const stamped = { ...next, added_at: new Date().toISOString() }
      await repo.save(stamped)
      setAuth(stamped)
    },
    [repo],
  )

  const disconnect = useCallback(async () => {
    await repo.clear()
    setAuth(null)
  }, [repo])

  return { auth, connect, disconnect }
}
