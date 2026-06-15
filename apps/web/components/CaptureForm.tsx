'use client'

import { useState } from 'react'
import { deriveSource, KNOWN_ROLE_TYPES, type Application, type RoleType } from '@ghosted/core'
import { plusDays, todayISO } from '../lib/dates'

// Capture: thirty seconds, standing up. ≤7 fields visible; role_type is
// required chips with examples (it powers the entire stats screen).
// The intent fork: capturing facts is step one; what happens next is the
// actual decision. Four explicit paths, none implied.
type Intent = 'have' | 'generate' | 'later' | 'remind'

const INTENTS: { id: Intent; label: string; detail: string }[] = [
  { id: 'have', label: 'Applying now — I have my materials', detail: 'Marks it applied today and starts the response clock.' },
  { id: 'generate', label: 'I need materials', detail: 'Saved and queued: cover letter + resume adjustments before applying.' },
  { id: 'later', label: 'Just saving it', detail: 'Sits in Saved until you decide.' },
  { id: 'remind', label: 'Remind me', detail: 'Saved — Today will nudge you on the date you pick.' },
]

export function CaptureForm({ onSubmit }: { onSubmit: (app: Application) => void | Promise<void> }) {
  const [company, setCompany] = useState('')
  const [position, setPosition] = useState('')
  const [roleType, setRoleType] = useState<RoleType | null>(null)
  const [customRole, setCustomRole] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [jobUrl, setJobUrl] = useState('')
  const [dateApplied, setDateApplied] = useState(todayISO())
  const [remindAt, setRemindAt] = useState(plusDays(3))
  const [resumeVersion, setResumeVersion] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isOther = roleType === 'other'

  function resolvedRoleType(): RoleType | null {
    if (roleType === null) return null
    if (isOther) return customRole.trim() || 'other'
    return roleType
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!company.trim()) return setError('Company is required.')
    if (!position.trim()) return setError('Position is required.')
    if (!roleType) return setError('Pick a role type — it powers your stats.')
    if (!intent) return setError('Pick what happens next.')

    const app: Application = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `app-${Date.now()}`,
      company: company.trim(),
      position: position.trim(),
      role_type: resolvedRoleType()!,
      status: intent === 'have' ? 'applied' : 'saved',
      events: intent === 'have' ? [{ type: 'applied', date: dateApplied }] : [],
    }
    if (intent === 'have') app.date_applied = dateApplied
    if (intent === 'generate') app.needs_materials = true
    if (intent === 'remind') app.remind_at = remindAt
    if (jobUrl.trim()) {
      app.job_url = jobUrl.trim()
      const source = deriveSource(jobUrl.trim())
      if (source) app.source = source
    }
    if (resumeVersion.trim()) app.resume_version = resumeVersion.trim()
    if (notes.trim()) app.notes = notes.trim()
    await onSubmit(app)
  }

  return (
    <form onSubmit={submit} className="capture-form">
      <label className="field">
        <span className="field-label">Company</span>
        <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} autoFocus placeholder="Who's getting your hopes up" />
      </label>

      <label className="field">
        <span className="field-label">Position</span>
        <input className="input" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="The job title" />
      </label>

      <div className="field">
        <span className="field-label">Role type</span>
        <div className="chips">
          {KNOWN_ROLE_TYPES.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`chip${roleType === chip.value ? ' chip-selected' : ''}`}
              onClick={() => setRoleType(chip.value)}
              title={chip.examples}
            >
              <span style={{ fontWeight: 500 }}>{chip.label}</span>
              <span className="chip-examples">{chip.examples}</span>
            </button>
          ))}
        </div>
        {isOther && (
          <div style={{ marginTop: 8 }}>
            <input
              className="input"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="Your role / field"
              aria-label="Your role / field"
            />
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label">What happens next?</span>
        <div className="connect-options">
          {INTENTS.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`chip connect-option${intent === i.id ? ' chip-selected' : ''}`}
              onClick={() => {
                setIntent(i.id)
                setError(null)
              }}
            >
              <span>{i.label}</span>
              <span className="chip-examples">{i.detail}</span>
            </button>
          ))}
        </div>
        {intent === 'have' && (
          <div className="row gap intent-extra">
            <span className="dim small">Applied on</span>
            <input
              type="date"
              className="input input-date"
              value={dateApplied}
              onChange={(e) => setDateApplied(e.target.value)}
              aria-label="Date applied"
            />
          </div>
        )}
        {intent === 'remind' && (
          <div className="row gap intent-extra">
            <span className="dim small">Nudge me on</span>
            <input
              type="date"
              className="input input-date"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              aria-label="Remind date"
            />
          </div>
        )}
      </div>

      <label className="field">
        <span className="field-label">
          Job URL <span className="dim">(optional — we read the source from it)</span>
        </span>
        <input className="input" value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} placeholder="https://…" inputMode="url" />
      </label>

      {!showMore ? (
        <button type="button" className="btn-link" onClick={() => setShowMore(true)}>
          + resume version, notes
        </button>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Resume version</span>
            <input className="input" value={resumeVersion} onChange={(e) => setResumeVersion(e.target.value)} placeholder="e.g. v2-design-eng" />
          </label>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary">
        {intent === 'generate' ? 'Continue to materials' : 'Add application'}
      </button>
    </form>
  )
}
