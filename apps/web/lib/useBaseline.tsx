'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { baselineStatus, type Baseline } from '@ghosted/core'
import { BaselineRepo, LocalStorageBaselineRepo } from './baselineRepo'

const BaselineContext = createContext<BaselineRepo | null>(null)

export function BaselineProvider({ repo, children }: { repo?: BaselineRepo; children: React.ReactNode }) {
  const value = useMemo(() => repo ?? new LocalStorageBaselineRepo(), [repo])
  return <BaselineContext.Provider value={value}>{children}</BaselineContext.Provider>
}

export function useBaseline() {
  const repo = useContext(BaselineContext)
  if (!repo) throw new Error('useBaseline must be used inside <BaselineProvider>')

  const [baseline, setBaseline] = useState<Baseline | null>(null)

  useEffect(() => {
    void repo.load().then(setBaseline)
  }, [repo])

  const save = useCallback(
    async (next: Baseline) => {
      const stamped = { ...next, updated_at: new Date().toISOString() }
      await repo.save(stamped)
      setBaseline(stamped)
    },
    [repo],
  )

  const clear = useCallback(async () => {
    await repo.clear()
    setBaseline(await repo.load())
  }, [repo])

  return {
    baseline, // null while loading
    status: baseline ? baselineStatus(baseline) : null,
    save,
    clear,
  }
}
