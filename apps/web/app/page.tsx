'use client'

import Link from 'next/link'
import { useState } from 'react'
import { isGhosted, needsFollowUp, reminderDue, type Application } from '@ghosted/core'
import { useApps } from '../lib/useApps'
import { useBaseline } from '../lib/useBaseline'
import { strings } from '../lib/strings'
import { sampleApps } from '../lib/sample'
import { relDays, todayISO } from '../lib/dates'
import { GhostBadge } from '../components/Badge'

// Today: answer "what should I do right now?" in one glance, then get out
// of the way. Follow-ups due → fresh ghosts → recent responses (quiet).
export default function Today() {
  const { apps, logEvent, importApps, updateApplication, transitionTo } = useApps()
  const { status: baselineReady } = useBaseline()
  const [justLogged, setJustLogged] = useState<string | null>(null)
  const today = todayISO()

  if (apps === null) return null

  const followUps = apps.filter((a) => needsFollowUp(a, today))
  const reminders = apps.filter((a) => reminderDue(a, today))
  const prep = apps.filter((a) => a.needs_materials && a.status === 'saved')
  const ghosts = apps.filter((a) => isGhosted(a, today) && !needsFollowUp(a, today))
  const recentResponses = apps.filter((a) =>
    a.events.some(
      (e) =>
        !e.corrected &&
        (e.type === 'response' || e.type === 'interview') &&
        Date.parse(today) - Date.parse(e.date) <= 7 * 86_400_000,
    ),
  )

  const nothingToDo = followUps.length === 0 && ghosts.length === 0 && reminders.length === 0 && prep.length === 0

  return (
    <div>
      <h1 className="page-title">Today</h1>

      {baselineReady && !baselineReady.ready && (
        <Link href="/onboarding" className="card baseline-nudge">
          <span>
            <strong>Set up your baseline</strong>
            <span className="dim"> — CV, voice, targeting. One time, ~10 minutes. The agent writes from your facts; this is where the facts come from.</span>
          </span>
          <span className="btn btn-small">Start</span>
        </Link>
      )}

      {apps.length === 0 && (
        <div className="card empty-state">
          <p>{strings.todayEmptyNoApps}</p>
          <div className="row gap">
            <Link href="/applications/new" className="btn btn-primary">
              {strings.addCta}
            </Link>
            <button className="btn" onClick={() => importApps(sampleApps(today))}>
              Load 3 sample applications
            </button>
          </div>
        </div>
      )}

      {apps.length > 0 && nothingToDo && (
        <div className="card empty-state">
          <p>{strings.todayEmpty}</p>
        </div>
      )}

      {followUps.length > 0 && (
        <section className="section">
          <h2 className="section-title">Follow-ups due</h2>
          <p className="dim small">{strings.followUpNudge}</p>
          {followUps.map((app) => (
            <TodayItem key={app.id} app={app} today={today}>
              <button
                className="btn btn-small"
                onClick={async () => {
                  await logEvent(app, 'follow_up')
                  setJustLogged(app.id)
                }}
              >
                Logged it
              </button>
            </TodayItem>
          ))}
        </section>
      )}

      {reminders.length > 0 && (
        <section className="section">
          <h2 className="section-title">You wanted to come back to these</h2>
          {reminders.map((app) => (
            <TodayItem key={app.id} app={app} today={today}>
              <button className="btn btn-small" onClick={() => transitionTo(app, 'applied')}>
                Applying now
              </button>
              <button
                className="btn-link"
                onClick={() => updateApplication({ ...app, remind_at: undefined })}
              >
                let it go
              </button>
            </TodayItem>
          ))}
        </section>
      )}

      {prep.length > 0 && (
        <section className="section">
          <h2 className="section-title">Materials to prepare</h2>
          <p className="dim small">
            Cover letter + resume adjustments before applying. The in-app apply flow is coming — meanwhile{' '}
            <span className="mono">ghosted2 new &lt;url&gt;</span> drafts these today.
          </p>
          {prep.map((app) => (
            <TodayItem key={app.id} app={app} today={today}>
              <button
                className="btn btn-small"
                onClick={() => transitionTo({ ...app, needs_materials: undefined }, 'applied')}
              >
                Materials done — applying
              </button>
            </TodayItem>
          ))}
        </section>
      )}

      {ghosts.length > 0 && (
        <section className="section">
          <h2 className="section-title">Gone quiet</h2>
          {ghosts.map((app) => (
            <TodayItem key={app.id} app={app} today={today}>
              <GhostBadge />
              <button className="btn btn-small" onClick={() => logEvent(app, 'follow_up')}>
                Follow up anyway
              </button>
            </TodayItem>
          ))}
        </section>
      )}

      {recentResponses.length > 0 && (
        <section className="section">
          <h2 className="section-title dim">Recent responses</h2>
          {recentResponses.map((app) => (
            <TodayItem key={app.id} app={app} today={today}>
              <span className="success small">{strings.responseLogged}</span>
            </TodayItem>
          ))}
        </section>
      )}

      {justLogged && <p className="dim small">Follow-up logged. Quiet again for 7 days.</p>}
    </div>
  )
}

function TodayItem({
  app,
  today,
  children,
}: {
  app: Application
  today: string
  children: React.ReactNode
}) {
  return (
    <div className="card today-item">
      <Link href={`/applications/${app.id}`} className="today-item-link">
        <span className="app-row-company">{app.company}</span>
        <span className="dim"> — {app.position}</span>
        {app.date_applied && <span className="mono dim small"> · applied {relDays(app.date_applied, today)} ago</span>}
      </Link>
      <div className="row gap">{children}</div>
    </div>
  )
}
