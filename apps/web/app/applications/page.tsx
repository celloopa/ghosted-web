'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Application, Status } from '@ghosted/core'
import { useApps } from '../../lib/useApps'
import { AppRow } from '../../components/AppRow'
import { strings } from '../../lib/strings'

// Inventory and triage. Status-grouped list (the decided hypothesis —
// board gets tested weekend 2). Closed recedes into a collapsed group.
const GROUPS: { status: Status; label: string }[] = [
  { status: 'offer', label: 'Offer' },
  { status: 'interviewing', label: 'Interviewing' },
  { status: 'applied', label: 'Applied' },
  { status: 'saved', label: 'Saved' },
]

export default function Applications() {
  const { apps } = useApps()
  const [showClosed, setShowClosed] = useState(false)

  if (apps === null) return null

  const closed = apps.filter((a) => a.status === 'closed')

  return (
    <div>
      <div className="row spread">
        <h1 className="page-title">Applications</h1>
        <Link href="/applications/new" className="btn btn-primary">
          {strings.addCta}
        </Link>
      </div>

      {apps.length === 0 && (
        <div className="card empty-state">
          <p>Nothing tracked yet. The void awaits its first entry.</p>
          <Link href="/applications/new" className="btn btn-primary">
            {strings.addCta}
          </Link>
        </div>
      )}

      {GROUPS.map(({ status, label }) => {
        const group = apps.filter((a) => a.status === status)
        if (group.length === 0) return null
        return (
          <section key={status} className="section">
            <h2 className="section-title">
              {label} <span className="dim mono small">{group.length}</span>
            </h2>
            {sortByRecency(group).map((app) => (
              <AppRow key={app.id} app={app} />
            ))}
          </section>
        )
      })}

      {closed.length > 0 && (
        <section className="section">
          <button className="btn-link" onClick={() => setShowClosed(!showClosed)}>
            {showClosed ? '▾' : '▸'} Closed <span className="mono">{closed.length}</span>
          </button>
          {showClosed && sortByRecency(closed).map((app) => <AppRow key={app.id} app={app} />)}
        </section>
      )}
    </div>
  )
}

function sortByRecency(apps: Application[]): Application[] {
  return [...apps].sort((a, b) => {
    const lastA = a.events[a.events.length - 1]?.date ?? a.date_applied ?? ''
    const lastB = b.events[b.events.length - 1]?.date ?? b.date_applied ?? ''
    return lastB.localeCompare(lastA)
  })
}
