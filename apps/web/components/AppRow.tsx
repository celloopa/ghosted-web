'use client'

import Link from 'next/link'
import { isGhosted, needsFollowUp, type Application } from '@ghosted/core'
import { FollowUpBadge, GhostBadge, StatusBadge } from './Badge'
import { relDays, todayISO } from '../lib/dates'

export function AppRow({ app, today = todayISO() }: { app: Application; today?: string }) {
  const last = app.events.length > 0 ? app.events[app.events.length - 1]!.date : undefined
  return (
    <Link href={`/applications/${app.id}`} className={`app-row${app.status === 'closed' ? ' app-row-closed' : ''}`}>
      <div className="app-row-main">
        <div className="app-row-company">{app.company}</div>
        <div className="app-row-position">{app.position}</div>
      </div>
      <div className="app-row-meta">
        <StatusBadge status={app.status} />
        {isGhosted(app, today) && <GhostBadge />}
        {needsFollowUp(app, today) && <FollowUpBadge />}
        {last && <span className="mono dim">{relDays(last, today)}</span>}
      </div>
    </Link>
  )
}
