'use client'

import { useState } from 'react'
import type { Materials, RewriteDecision, RewriteCheck } from '@ghosted/core'

const MAX_BADGE_TERMS = 4

function HonestyBadges({ check }: { check: RewriteCheck }) {
  if (check.ok) return null

  const inventions = [...check.inventedNumbers, ...check.inventedTerms]
  const shown = inventions.slice(0, MAX_BADGE_TERMS)
  const overflow = inventions.length - shown.length

  return (
    <div className="row gap wrap" style={{ marginTop: 4 }}>
      {!check.sourceFound && (
        <span className="badge dim small" data-testid="badge-source-not-found">source not in CV</span>
      )}
      {inventions.length > 0 && (
        <span className="badge dim small" data-testid="badge-unverified">
          unverified: {shown.join(', ')}{overflow > 0 ? `, +${overflow}` : ''}
        </span>
      )}
    </div>
  )
}

export function RewritesPanel({
  rewrites,
  decisions,
  onDecide,
  onCopyAccepted,
  fallback,
  checks,
}: {
  rewrites: Materials['resume_rewrites']
  decisions: Materials['rewrite_decisions']
  onDecide: (index: number, decision: RewriteDecision | null) => void
  onCopyAccepted: () => void
  fallback: React.ReactNode
  checks?: RewriteCheck[]
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const hasAccepted = rewrites?.some((_, i) => decisions?.[i]?.status === 'accepted') ?? false

  if (!rewrites?.length) return <>{fallback}</>

  return (
    <div className="rewrites-triage" data-testid="rewrites-triage">
      <div className="row spread gap" style={{ marginBottom: 8 }}>
        <span className="dim small mono">{rewrites.length} suggestions</span>
        <button
          className="btn btn-small"
          disabled={!hasAccepted}
          onClick={onCopyAccepted}
          aria-label="Copy accepted rewrites"
        >
          Copy accepted
        </button>
      </div>
      {rewrites.map((r, i) => {
        const decision = decisions?.[i]
        const status = decision?.status
        const isEditing = editing === i
        const check = checks?.[i]

        if (status === 'rejected') {
          return (
            <div key={`${r.source}-${i}`} className="suggestion-card rewrite-rejected">
              <div className="row gap">
                <span className="mono dim small" style={{ flex: 1 }}>{r.source}</span>
                <button className="btn-link" onClick={() => onDecide(i, null)} aria-label="Undo reject">
                  undo
                </button>
              </div>
            </div>
          )
        }

        return (
          <div
            key={`${r.source}-${i}`}
            className={`suggestion-card${status === 'accepted' ? ' rewrite-accepted' : ''}`}
          >
            <p className="mono dim small">from: {r.source}</p>
            {check && <HonestyBadges check={check} />}
            {isEditing ? (
              <>
                <textarea
                  className="input rewrite-edit-area"
                  rows={4}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  aria-label="Edit rewrite"
                />
                <div className="row gap" style={{ marginTop: 6 }}>
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => {
                      onDecide(i, { status: 'accepted', edited: editDraft.trim() || r.rewrite })
                      setEditing(null)
                    }}
                  >
                    Save
                  </button>
                  <button className="btn-link" onClick={() => setEditing(null)}>
                    cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>{decision?.edited ?? r.rewrite}</p>
                <p className="dim small">{r.why}</p>
                <div className="row gap" style={{ marginTop: 6 }}>
                  {status !== 'accepted' && (
                    <button
                      className="btn btn-small"
                      onClick={() => onDecide(i, { status: 'accepted' })}
                      aria-label={`Accept rewrite ${i + 1}`}
                    >
                      Accept
                    </button>
                  )}
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setEditDraft(decision?.edited ?? r.rewrite)
                      setEditing(i)
                    }}
                    aria-label={`Edit rewrite ${i + 1}`}
                  >
                    Edit
                  </button>
                  {status !== 'accepted' && (
                    <button
                      className="btn-link"
                      onClick={() => onDecide(i, { status: 'rejected' })}
                      aria-label={`Reject rewrite ${i + 1}`}
                    >
                      Reject
                    </button>
                  )}
                  {status === 'accepted' && (
                    <button className="btn-link" onClick={() => onDecide(i, null)} aria-label="Undo accept">
                      undo
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
