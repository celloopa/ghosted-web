'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  transition,
  type Application,
  type ApplicationEvent,
  type ClosedReason,
  type Status,
} from '@ghosted/core'
import { ApplicationRepo, LocalStorageRepo } from './repo'
import { todayISO } from './dates'

const RepoContext = createContext<ApplicationRepo>(new LocalStorageRepo())

export function RepoProvider({ repo, children }: { repo?: ApplicationRepo; children: React.ReactNode }) {
  const value = useMemo(() => repo ?? new LocalStorageRepo(), [repo])
  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>
}

export function useApps() {
  const repo = useContext(RepoContext)

  const [apps, setApps] = useState<Application[] | null>(null)

  const refresh = useCallback(async () => {
    setApps(await repo.list())
  }, [repo])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addApplication = useCallback(
    async (app: Application) => {
      await repo.upsert(app)
      await refresh()
    },
    [repo, refresh],
  )

  /** Full-object update (clear a reminder, mark materials ready, …). */
  const updateApplication = useCallback(
    async (app: Application) => {
      await repo.upsert(app)
      await refresh()
    },
    [repo, refresh],
  )

  /** The core move: record a fact; derived states recompute themselves. */
  const logEvent = useCallback(
    async (app: Application, type: ApplicationEvent['type'], detail?: string) => {
      const event: ApplicationEvent = { type, date: todayISO() }
      if (detail) event.detail = detail
      await repo.upsert({ ...app, events: [...app.events, event] })
      await refresh()
    },
    [repo, refresh],
  )

  /** Append-only corrections: events are flagged, never deleted. */
  const correctEvent = useCallback(
    async (app: Application, index: number) => {
      const events = app.events.map((e, i) => (i === index ? { ...e, corrected: !e.corrected } : e))
      await repo.upsert({ ...app, events })
      await refresh()
    },
    [repo, refresh],
  )

  const transitionTo = useCallback(
    async (app: Application, status: Status, closedReason?: ClosedReason): Promise<string | null> => {
      const opts: { date: string; closedReason?: ClosedReason } = { date: todayISO() }
      if (closedReason) opts.closedReason = closedReason
      const result = transition(app, status, opts)
      if (!result.ok) return result.error.message
      await repo.upsert(result.value)
      await refresh()
      return null
    },
    [repo, refresh],
  )

  const removeApplication = useCallback(
    async (id: string) => {
      await repo.remove(id)
      await refresh()
    },
    [repo, refresh],
  )

  const importApps = useCallback(
    async (incoming: Application[]) => {
      const existing = await repo.list()
      const byId = new Map(existing.map((a) => [a.id, a]))
      for (const app of incoming) byId.set(app.id, app)
      await repo.replaceAll([...byId.values()])
      await refresh()
    },
    [repo, refresh],
  )

  const replaceAll = useCallback(
    async (next: Application[]) => {
      await repo.replaceAll(next)
      await refresh()
    },
    [repo, refresh],
  )

  return {
    apps, // null while loading
    refresh,
    addApplication,
    updateApplication,
    logEvent,
    correctEvent,
    transitionTo,
    removeApplication,
    importApps,
    replaceAll,
  }
}
