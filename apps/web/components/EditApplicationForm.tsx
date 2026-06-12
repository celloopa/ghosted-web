'use client'

import { useState } from 'react'
import type { Application, RoleType } from '@ghosted/core'

const ROLE_CHIPS: { value: RoleType; label: string }[] = [
  { value: 'design_engineer', label: 'Design Engineer' },
  { value: 'product_designer', label: 'Product Designer' },
  { value: 'brand_motion', label: 'Brand / Motion' },
  { value: 'other', label: 'Other' },
]

interface Props {
  app: Application
  onSave: (app: Application) => void | Promise<void>
  onCancel: () => void
}

export function EditApplicationForm({ app, onSave, onCancel }: Props) {
  const [company, setCompany] = useState(app.company)
  const [position, setPosition] = useState(app.position)
  const [roleType, setRoleType] = useState<RoleType>(app.role_type)
  const [location, setLocation] = useState(app.location ?? '')
  const [remote, setRemote] = useState<boolean | undefined>(app.remote)
  const [salaryMin, setSalaryMin] = useState(app.salary_min != null ? String(app.salary_min) : '')
  const [salaryMax, setSalaryMax] = useState(app.salary_max != null ? String(app.salary_max) : '')
  const [jobUrl, setJobUrl] = useState(app.job_url ?? '')
  const [resumeVersion, setResumeVersion] = useState(app.resume_version ?? '')
  const [notes, setNotes] = useState(app.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!company.trim()) {
      setError('Company is required.')
      return
    }
    if (!position.trim()) {
      setError('Position is required.')
      return
    }

    const parseSalary = (raw: string): number | undefined => {
      const trimmed = raw.trim()
      if (!trimmed) return undefined
      const n = Number(trimmed)
      return isNaN(n) ? undefined : n
    }

    const updated: Application = {
      ...app,
      company: company.trim(),
      position: position.trim(),
      role_type: roleType,
    }

    // Optional fields: set to value or delete the key entirely when blank
    const loc = location.trim()
    if (loc) updated.location = loc
    else delete updated.location

    if (remote !== undefined) updated.remote = remote
    else delete updated.remote

    const min = parseSalary(salaryMin)
    if (min !== undefined) updated.salary_min = min
    else delete updated.salary_min

    const max = parseSalary(salaryMax)
    if (max !== undefined) updated.salary_max = max
    else delete updated.salary_max

    const url = jobUrl.trim()
    if (url) updated.job_url = url
    else delete updated.job_url

    const rv = resumeVersion.trim()
    if (rv) updated.resume_version = rv
    else delete updated.resume_version

    const n = notes.trim()
    if (n) updated.notes = n
    else delete updated.notes

    await onSave(updated)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span className="field-label">Company</span>
        <input
          className="input"
          value={company}
          onChange={(e) => { setCompany(e.target.value); setError(null) }}
          autoFocus
          placeholder="Company name"
        />
      </label>

      <label className="field">
        <span className="field-label">Position</span>
        <input
          className="input"
          value={position}
          onChange={(e) => { setPosition(e.target.value); setError(null) }}
          placeholder="Job title"
        />
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
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field-label">Location <span className="dim">(optional)</span></span>
        <input
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, State or Remote"
        />
      </label>

      <div className="field">
        <span className="field-label">Work arrangement <span className="dim">(optional)</span></span>
        <div className="chips">
          <button
            type="button"
            className={`chip${remote === true ? ' chip-selected' : ''}`}
            onClick={() => setRemote(remote === true ? undefined : true)}
          >
            Remote
          </button>
          <button
            type="button"
            className={`chip${remote === false ? ' chip-selected' : ''}`}
            onClick={() => setRemote(remote === false ? undefined : false)}
          >
            Hybrid or onsite
          </button>
        </div>
      </div>

      <div className="row gap">
        <label className="field">
          <span className="field-label">Salary min <span className="dim">(optional, yearly)</span></span>
          <input
            className="input"
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value.replace(/\D/g, ''))}
            placeholder="150000"
            inputMode="numeric"
          />
        </label>
        <label className="field">
          <span className="field-label">Salary max <span className="dim">(optional, yearly)</span></span>
          <input
            className="input"
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value.replace(/\D/g, ''))}
            placeholder="200000"
            inputMode="numeric"
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Job URL <span className="dim">(optional)</span></span>
        <input
          className="input"
          value={jobUrl}
          onChange={(e) => setJobUrl(e.target.value)}
          placeholder="https://…"
          inputMode="url"
        />
      </label>

      <label className="field">
        <span className="field-label">Resume version <span className="dim">(optional)</span></span>
        <input
          className="input"
          value={resumeVersion}
          onChange={(e) => setResumeVersion(e.target.value)}
          placeholder="e.g. v2-design-eng"
        />
      </label>

      <label className="field">
        <span className="field-label">Notes <span className="dim">(optional)</span></span>
        <textarea
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="row gap">
        <button type="submit" className="btn btn-primary">Save changes</button>
        <button type="button" className="btn-link" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
