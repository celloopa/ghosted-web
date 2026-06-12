'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  isGhosted,
  needsFollowUp,
  renderQuestionsDoc,
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
import { buildDownloadName, isContentNewerThanExport } from '../../../lib/applyHelpers'

const EVENT_LABELS: Record<ApplicationEvent['type'], string> = {
  applied: 'Applied',
  response: 'They responded',
  interview: 'Interview',
  follow_up: 'Followed up',
  note: 'Note',
}

// ── Relative-time helper ──────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Inline-blob download helpers ──────────────────────────────────────────────

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Exported-file record from GET /api/export ─────────────────────────────────

interface ExportedFile {
  name: string
  size: number
  mtime: string
}

// ── Documents section ─────────────────────────────────────────────────────────

function DocumentsSection({ app }: { app: Application }) {
  const materials = app.materials!
  const [copied, setCopied] = useState<string | null>(null)
  const [pdfFiles, setPdfFiles] = useState<ExportedFile[]>([])

  // Fetch existing PDFs from server on mount
  useEffect(() => {
    void fetch(`/api/export?appId=${encodeURIComponent(app.id)}`)
      .then((r) => r.json())
      .then((d: { files?: ExportedFile[] }) => {
        if (Array.isArray(d.files)) setPdfFiles(d.files)
      })
      .catch(() => undefined)
  }, [app.id])

  function copy(key: string, text: string) {
    void navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const coverLetterName = buildDownloadName(app.company, 'cover-letter')
  const resumeAdjName = buildDownloadName(app.company, 'resume-adjustments')

  const companySlugged = app.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company'

  // Staleness: content changed since last export
  const stale = isContentNewerThanExport(materials)

  const generatedAt = materials.generated_at ? relativeDate(materials.generated_at) : 'unknown'
  const exportedAt = materials.exported_at ? shortDate(materials.exported_at) : 'not yet'

  // PDF lookup helpers
  const pdfFor = (name: string) => pdfFiles.find((f) => f.name === name)
  const coverPdf = pdfFor('cover-letter.pdf')
  const resumePdf = pdfFor('resume.pdf')

  function pdfHref(serverName: string, friendlyName: string) {
    return `/api/export/file?appId=${encodeURIComponent(app.id)}&name=${encodeURIComponent(serverName)}&dl=${encodeURIComponent(friendlyName)}`
  }

  return (
    <section className="section">
      <div className="card reveal">
        <h2 className="section-title">Documents</h2>
        <p className="dim small mono" style={{ margin: '0 0 14px' }}>
          generated {generatedAt}
          {materials.model ? ` · model ${materials.model}` : ''}
          {' · '}exported {exportedAt}
        </p>

        {stale && (
          <p className="dim small" style={{ margin: '0 0 12px' }}>
            content changed since the last PDF export
          </p>
        )}

        {/* Document rows — one per document */}
        <div className="doc-rows">
          {materials.cover_letter && (
            <div className="doc-row">
              <span className="doc-row-name">Cover letter</span>
              <span className="doc-row-actions">
                <button
                  className="doc-action"
                  onClick={() => copy('letter', materials.cover_letter!)}
                >
                  {copied === 'letter' ? 'copied' : 'copy'}
                </button>
                <span className="doc-action-sep" aria-hidden>·</span>
                <button
                  className="doc-action"
                  onClick={() => downloadBlob(materials.cover_letter!, coverLetterName)}
                >
                  md
                </button>
                {coverPdf && (
                  <>
                    <span className="doc-action-sep" aria-hidden>·</span>
                    <a
                      className="doc-action"
                      href={pdfHref('cover-letter.pdf', `${companySlugged}-cover-letter.pdf`)}
                      download={`${companySlugged}-cover-letter.pdf`}
                    >
                      pdf
                    </a>
                  </>
                )}
              </span>
            </div>
          )}
          {materials.resume_adjustments && (
            <div className="doc-row">
              <span className="doc-row-name">Resume adjustments</span>
              <span className="doc-row-actions">
                <button
                  className="doc-action"
                  onClick={() => copy('adj', materials.resume_adjustments!)}
                >
                  {copied === 'adj' ? 'copied' : 'copy'}
                </button>
                <span className="doc-action-sep" aria-hidden>·</span>
                <button
                  className="doc-action"
                  onClick={() => downloadBlob(materials.resume_adjustments!, resumeAdjName)}
                >
                  md
                </button>
                {resumePdf && (
                  <>
                    <span className="doc-action-sep" aria-hidden>·</span>
                    <a
                      className="doc-action"
                      href={pdfHref('resume.pdf', `${companySlugged}-resume.pdf`)}
                      download={`${companySlugged}-resume.pdf`}
                    >
                      pdf
                    </a>
                  </>
                )}
              </span>
            </div>
          )}
          {materials.qa?.length ? (() => {
            const questionsName = buildDownloadName(app.company, 'questions')
            const questionsContent = renderQuestionsDoc(app.company, app.position, materials.qa)
            return (
              <div className="doc-row">
                <span className="doc-row-name">Questions ({materials.qa.length})</span>
                <span className="doc-row-actions">
                  <button
                    className="doc-action"
                    onClick={() => copy('qa', questionsContent)}
                  >
                    {copied === 'qa' ? 'copied' : 'copy'}
                  </button>
                  <span className="doc-action-sep" aria-hidden>·</span>
                  <button
                    className="doc-action"
                    onClick={() => downloadBlob(questionsContent, questionsName)}
                  >
                    md
                  </button>
                </span>
              </div>
            )
          })() : null}
        </div>

        {/* Re-entry CTA */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <Link href={`/apply?id=${app.id}`} className="btn">
            Open materials workspace
          </Link>
          <p className="dim small" style={{ margin: '6px 0 0' }}>
            revise content · change style · re-export
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Main detail page ──────────────────────────────────────────────────────────

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
          {app.needs_materials && (
            <Fact
              label="workspace"
              value={
                <Link href={`/apply?id=${app.id}`} className="link">
                  needed — open the apply workspace
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

      {/* Documents section — shown whenever materials exist */}
      {app.materials && <DocumentsSection app={app} />}

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
