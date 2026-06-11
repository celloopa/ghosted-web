'use client'

import { useState } from 'react'
import { deriveSource, type Application, type RoleType } from '@ghosted/core'
import { todayISO } from '../lib/dates'

// Capture: thirty seconds, standing up. ≤7 fields visible; role_type is
// required chips with examples (it powers the entire stats screen).
const ROLE_CHIPS: { value: RoleType; label: string; examples: string }[] = [
  { value: 'design_engineer', label: 'Design Engineer', examples: 'design engineer, UX engineer, creative technologist' },
  { value: 'product_designer', label: 'Product Designer', examples: 'product, UX, interaction design' },
  { value: 'brand_motion', label: 'Brand / Motion', examples: 'brand, visual, motion, marketing design' },
  { value: 'other', label: 'Other', examples: 'everything else — still counts' },
]

export function CaptureForm({ onSubmit }: { onSubmit: (app: Application) => void | Promise<void> }) {
  const [company, setCompany] = useState('')
  const [position, setPosition] = useState('')
  const [roleType, setRoleType] = useState<RoleType | null>(null)
  const [applied, setApplied] = useState(true)
  const [jobUrl, setJobUrl] = useState('')
  const [dateApplied, setDateApplied] = useState(todayISO())
  const [resumeVersion, setResumeVersion] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!company.trim()) return setError('Company is required.')
    if (!position.trim()) return setError('Position is required.')
    if (!roleType) return setError('Pick a role type — it powers your stats.')

    const app: Application = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `app-${Date.now()}`,
      company: company.trim(),
      position: position.trim(),
      role_type: roleType,
      status: applied ? 'applied' : 'saved',
      events: applied ? [{ type: 'applied', date: dateApplied }] : [],
    }
    if (applied) app.date_applied = dateApplied
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
          {ROLE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`chip${roleType === chip.value ? ' chip-selected' : ''}`}
              onClick={() => setRoleType(chip.value)}
              title={chip.examples}
            >
              <span>{chip.label}</span>
              <span className="chip-examples">{chip.examples}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Status</span>
        <div className="row gap">
          <button type="button" className={`chip${applied ? ' chip-selected' : ''}`} onClick={() => setApplied(true)}>
            Applied
          </button>
          <button type="button" className={`chip${!applied ? ' chip-selected' : ''}`} onClick={() => setApplied(false)}>
            Just saving it
          </button>
          {applied && (
            <input
              type="date"
              className="input input-date"
              value={dateApplied}
              onChange={(e) => setDateApplied(e.target.value)}
              aria-label="Date applied"
            />
          )}
        </div>
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
        Add application
      </button>
    </form>
  )
}
