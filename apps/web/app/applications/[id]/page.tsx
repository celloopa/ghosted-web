'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  isGhosted,
  needsFollowUp,
  type ApplicationEvent,
  type ClosedReason,
  type Status,
  type Application,
} from '@ghosted/core'
import { useApps } from '../../../lib/useApps'
import { FollowUpBadge, GhostBadge, StatusBadge } from '../../../components/Badge'
import { EditApplicationForm } from '../../../components/EditApplicationForm'
import { todayISO } from '../../../lib/dates'
import { strings } from '../../../lib/strings'

const EVENT_LABELS: Record<ApplicationEvent['type'], string> = {
  applied: 'Applied',
  response: 'They responded',
  interview: 'Interview',
  follow_up: 'Followed up',
  note: 'Note',
}

export default function Detail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { apps, logEvent, correctEvent, transitionTo, removeApplication, updateApplication } = useApps()
  const [closing, setClosing] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const today = todayISO()

  if (apps === null) return null
  const app = apps.find((a) => a.id === id)
  if (!app) return <p className="dim">Not found. It may have been deleted.</p>

  const events = [...app.events].map((e, i) => ({ ...e, i })).sort((a, b) => b.date.localeCompare(a.date) || b.i - a.i)

  const forward: Status[] = (
    { saved: ['applied'], applied: ['interviewing', 'offer'], interviewing: ['offer'], offer: [], closed: [] } as Record<Status, Status[]>
  )[app.status]

  async function handleSave(updated: Application) {
    await updateApplication(updated)
    setEditing(false)
  }

  return (
    <div className="narrow">
      <div className="row spread">
        <div>
          <h1 className="page-title">{app.company}</h1>
          <p className="dim">{app.position}</p>
        </div>
        <div className="row gap detail-badges">
          <StatusBadge status={app.status} />
          {isGhosted(app, today) && <GhostBadge />}
          {needsFollowUp(app, today) && <FollowUpBadge />}
        </div>
      </div>

      {/* Facts — secondary to the timeline */}
      {editing ? (
        <div className="card">
          <EditApplicationForm
            app={app}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="card facts">
          <div className="row spread">
            <span />
            <button className="btn btn-small" onClick={() => setEditing(true)}>Edit</button>
          </div>
          {app.closed_reason && <Fact label="closed" value={app.closed_reason} />}
          {(app.posting || app.materials) && (
            <Fact
              label="workspace"
              value={
                <Link href={`/apply?id=${app.id}`} className="link">
                  {app.needs_materials ? 'needed — open the apply workspace' : 'review materials'}
                </Link>
              }
            />
          )}
          {app.remind_at && <Fact label="remind" value={app.remind_at} />}
          {app.role_type && <Fact label="role type" value={app.role_type.replace('_', ' ')} />}
          {app.source && <Fact label="source" value={app.source} />}
          {app.date_applied && <Fact label="applied" value={app.date_applied} />}
          {app.resume_version && <Fact label="resume" value={app.resume_version} />}
          {(app.salary_min || app.salary_max) && (
            <Fact label="salary" value={[app.salary_min, app.salary_max].filter(Boolean).map((n) => `$${n!.toLocaleString()}`).join(' – ')} />
          )}
          {app.job_url && (
            <Fact label="url" value={<a href={app.job_url} target="_blank" rel="noreferrer" className="link">{new URL(app.job_url).hostname}</a>} />
          )}
          {app.notes && <Fact label="notes" value={app.notes} />}
        </div>
      )}

      {/* Log an event — the user states facts; judgments compute themselves */}
      <div className="row gap wrap">
        <button className="btn" onClick={() => logEvent(app, 'response')}>They responded</button>
        <button className="btn" onClick={() => logEvent(app, 'interview')}>Interview</button>
        <button className="btn" onClick={() => logEvent(app, 'follow_up')}>I followed up</button>
      </div>
      <div className="row gap">
        <input
          className="input"
          placeholder="Add a note…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && noteDraft.trim()) {
              await logEvent(app, 'note', noteDraft.trim())
              setNoteDraft('')
            }
          }}
        />
      </div>

      {/* Status moves */}
      <div className="row gap wrap section">
        {forward.map((s) => (
          <button key={s} className="btn btn-small" onClick={async () => setError(await transitionTo(app, s))}>
            → {s}
          </button>
        ))}
        {app.status !== 'closed' && !closing && (
          <button className="btn btn-small" onClick={() => setClosing(true)}>
            Close…
          </button>
        )}
        {closing && (
          <span className="row gap">
            {(['rejected', 'withdrawn', 'accepted'] as ClosedReason[]).map((reason) => (
              <button
                key={reason}
                className="btn btn-small"
                onClick={async () => {
                  setError(await transitionTo(app, 'closed', reason))
                  setClosing(false)
                }}
              >
                {reason}
              </button>
            ))}
            <button className="btn-link" onClick={() => setClosing(false)}>cancel</button>
          </span>
        )}
      </div>
      {app.status === 'closed' && <p className="dim small">{strings.closedConfirm}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {/* Timeline — the hero */}
      <section className="section">
        <h2 className="section-title">Timeline</h2>
        {events.length === 0 && <p className="dim">No events yet.</p>}
        {events.map((e) => (
          <div key={e.i} className={`timeline-item timeline-${e.type}${e.corrected ? ' timeline-corrected' : ''}`}>
            <span className="timeline-dot" aria-hidden />
            <span className="mono dim small">{e.date}</span>
            <span className="timeline-label">{EVENT_LABELS[e.type]}</span>
            {e.detail && <span className="dim">— {e.detail}</span>}
            <button
              className="btn-link timeline-correct"
              title={e.corrected ? 'restore this event' : 'mark as logged in error (kept, not deleted)'}
              onClick={() => correctEvent(app, e.i)}
            >
              {e.corrected ? 'restore' : '✕'}
            </button>
          </div>
        ))}
      </section>

      <button
        className="btn-link danger"
        onClick={async () => {
          if (confirm(`Delete ${app.company} — ${app.position}? The export in Settings is your undo.`)) {
            await removeApplication(app.id)
            router.push('/applications')
          }
        }}
      >
        Delete application
      </button>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <span>{value}</span>
    </div>
  )
}
