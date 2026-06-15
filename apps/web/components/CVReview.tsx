'use client'

import { useState } from 'react'
import { validateCVJson, viewToCvJson, type CVView } from '@ghosted/core'

// CVReview renders a CVView as a human-readable, fully editable resumé preview.
// Every field is editable inline. The user confirms once they're satisfied.
// The only output is a valid JSON Resume string passed to onConfirm.

export interface CVReviewProps {
  initial: CVView
  onConfirm: (cvJson: string) => void
  onStartOver: () => void
  onRegenerate?: () => void
  busy?: boolean
}

export function CVReview({ initial, onConfirm, onStartOver, onRegenerate, busy }: CVReviewProps) {
  const [view, setView] = useState<CVView>(() => ({
    ...initial,
    contact: { ...initial.contact, links: [...initial.contact.links] },
    work: initial.work.map((w) => ({ ...w, highlights: [...w.highlights] })),
    projects: initial.projects.map((p) => ({ ...p, highlights: [...p.highlights] })),
    skills: [...initial.skills],
    education: [...initial.education],
  }))

  const cvJson = viewToCvJson(view)
  const validation = validateCVJson(cvJson)
  const isValid = view.name.trim().length > 0 && validation.ok

  function setField<K extends keyof CVView>(key: K, value: CVView[K]) {
    setView((prev) => ({ ...prev, [key]: value }))
  }

  function setContactField<K extends keyof CVView['contact']>(key: K, value: CVView['contact'][K]) {
    setView((prev) => ({ ...prev, contact: { ...prev.contact, [key]: value } }))
  }

  // Work helpers
  function setWorkField(index: number, field: keyof CVView['work'][number], value: string) {
    setView((prev) => {
      const work = [...prev.work]
      work[index] = { ...work[index], [field]: value }
      return { ...prev, work }
    })
  }

  function setWorkBullet(workIndex: number, bulletIndex: number, value: string) {
    setView((prev) => {
      const work = [...prev.work]
      const highlights = [...work[workIndex].highlights]
      highlights[bulletIndex] = value
      work[workIndex] = { ...work[workIndex], highlights }
      return { ...prev, work }
    })
  }

  function addWorkBullet(workIndex: number) {
    setView((prev) => {
      const work = [...prev.work]
      work[workIndex] = { ...work[workIndex], highlights: [...work[workIndex].highlights, ''] }
      return { ...prev, work }
    })
  }

  function removeWorkBullet(workIndex: number, bulletIndex: number) {
    setView((prev) => {
      const work = [...prev.work]
      const highlights = work[workIndex].highlights.filter((_, i) => i !== bulletIndex)
      work[workIndex] = { ...work[workIndex], highlights }
      return { ...prev, work }
    })
  }

  function addWorkEntry() {
    setView((prev) => ({
      ...prev,
      work: [...prev.work, { company: '', title: '', start: '', end: '', highlights: [''] }],
    }))
  }

  function removeWorkEntry(index: number) {
    setView((prev) => ({ ...prev, work: prev.work.filter((_, i) => i !== index) }))
  }

  // Education helpers
  function setEducationField(index: number, field: keyof CVView['education'][number], value: string) {
    setView((prev) => {
      const education = [...prev.education]
      education[index] = { ...education[index], [field]: value }
      return { ...prev, education }
    })
  }

  function addEducationEntry() {
    setView((prev) => ({
      ...prev,
      education: [...prev.education, { institution: '', area: '', studyType: '', year: '' }],
    }))
  }

  function removeEducationEntry(index: number) {
    setView((prev) => ({ ...prev, education: prev.education.filter((_, i) => i !== index) }))
  }

  // Projects helpers
  function setProjectField(index: number, field: keyof CVView['projects'][number], value: string) {
    setView((prev) => {
      const projects = [...prev.projects]
      projects[index] = { ...projects[index], [field]: value } as CVView['projects'][number]
      return { ...prev, projects }
    })
  }

  function setProjectBullet(pIndex: number, bulletIndex: number, value: string) {
    setView((prev) => {
      const projects = [...prev.projects]
      const highlights = [...projects[pIndex].highlights]
      highlights[bulletIndex] = value
      projects[pIndex] = { ...projects[pIndex], highlights }
      return { ...prev, projects }
    })
  }

  function addProjectBullet(pIndex: number) {
    setView((prev) => {
      const projects = [...prev.projects]
      projects[pIndex] = { ...projects[pIndex], highlights: [...projects[pIndex].highlights, ''] }
      return { ...prev, projects }
    })
  }

  function removeProjectBullet(pIndex: number, bulletIndex: number) {
    setView((prev) => {
      const projects = [...prev.projects]
      const highlights = projects[pIndex].highlights.filter((_, i) => i !== bulletIndex)
      projects[pIndex] = { ...projects[pIndex], highlights }
      return { ...prev, projects }
    })
  }

  function addProjectEntry() {
    setView((prev) => ({
      ...prev,
      projects: [...prev.projects, { name: '', description: '', url: '', highlights: [] }],
    }))
  }

  function removeProjectEntry(index: number) {
    setView((prev) => ({ ...prev, projects: prev.projects.filter((_, i) => i !== index) }))
  }

  // Skills helpers
  function addSkill(skill: string) {
    const trimmed = skill.trim()
    if (!trimmed || view.skills.includes(trimmed)) return
    setField('skills', [...view.skills, trimmed])
  }

  function removeSkill(skill: string) {
    setField('skills', view.skills.filter((s) => s !== skill))
  }

  // Links helpers
  function setLink(index: number, field: 'label' | 'url', value: string) {
    const links = [...view.contact.links]
    links[index] = { ...links[index], [field]: value }
    setContactField('links', links.filter((l) => l.label.trim() !== '' || l.url.trim() !== ''))
  }

  return (
    <div className="cvr-wrap">
      {/* Header */}
      <div className="cvr-header card">
        <div className="cvr-name-row row gap">
          <div className="cvr-name-field">
            <label className="field-label">Name</label>
            <input
              className="input cvr-name-input"
              value={view.name}
              placeholder="Your name"
              onChange={(e) => setField('name', e.target.value)}
            />
          </div>
          <div className="cvr-name-field">
            <label className="field-label">Headline (optional)</label>
            <input
              className="input"
              value={view.headline ?? ''}
              placeholder="Software Engineer"
              onChange={(e) => setField('headline', e.target.value || undefined)}
            />
          </div>
        </div>

        <div className="cvr-contact-row row gap wrap">
          <label className="field cvr-contact-field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              value={view.contact.email ?? ''}
              placeholder="you@example.com"
              onChange={(e) => setContactField('email', e.target.value || undefined)}
            />
          </label>
          <label className="field cvr-contact-field">
            <span className="field-label">Phone</span>
            <input
              className="input"
              value={view.contact.phone ?? ''}
              placeholder="+1 555 000 0000"
              onChange={(e) => setContactField('phone', e.target.value || undefined)}
            />
          </label>
          <label className="field cvr-contact-field">
            <span className="field-label">Location</span>
            <input
              className="input"
              value={view.contact.location ?? ''}
              placeholder="City, State"
              onChange={(e) => setContactField('location', e.target.value || undefined)}
            />
          </label>
        </div>

        {/* Links */}
        <div className="cvr-links">
          <span className="field-label">Links</span>
          {[...view.contact.links, { label: '', url: '' }].map((link, i) => (
            <div key={i} className="row gap cvr-link-row">
              <input
                className="input cvr-link-label"
                placeholder="Label"
                value={link.label}
                onChange={(e) => setLink(i, 'label', e.target.value)}
              />
              <input
                className="input"
                placeholder="https://…"
                value={link.url}
                onChange={(e) => setLink(i, 'url', e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="cvr-section card">
        <h3 className="section-title cvr-section-heading">Summary</h3>
        <textarea
          className="input cvr-summary"
          rows={3}
          placeholder="A short professional summary (optional)"
          value={view.summary ?? ''}
          onChange={(e) => setField('summary', e.target.value || undefined)}
        />
      </div>

      {/* Work experience */}
      <div className="cvr-section card">
        <h3 className="section-title cvr-section-heading">Work experience</h3>
        {view.work.map((entry, wi) => (
          <div key={wi} className="cvr-entry">
            <div className="row gap wrap cvr-entry-head">
              <input
                className="input"
                placeholder="Company"
                value={entry.company}
                onChange={(e) => setWorkField(wi, 'company', e.target.value)}
              />
              <input
                className="input"
                placeholder="Job title"
                value={entry.title ?? ''}
                onChange={(e) => setWorkField(wi, 'title', e.target.value || '')}
              />
              <input
                className="input cvr-date"
                placeholder="Start"
                value={entry.start ?? ''}
                onChange={(e) => setWorkField(wi, 'start', e.target.value || '')}
              />
              <input
                className="input cvr-date"
                placeholder="End or present"
                value={entry.end ?? ''}
                onChange={(e) => setWorkField(wi, 'end', e.target.value || '')}
              />
            </div>

            <div className="cvr-bullets">
              {entry.highlights.map((bullet, bi) => (
                <div key={bi} className="row gap cvr-bullet-row">
                  <input
                    className="input"
                    value={bullet}
                    placeholder="A key achievement or responsibility"
                    onChange={(e) => setWorkBullet(wi, bi, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-link danger"
                    aria-label="Remove bullet"
                    onClick={() => removeWorkBullet(wi, bi)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-small" onClick={() => addWorkBullet(wi)}>
                Add bullet
              </button>
            </div>

            <button
              type="button"
              className="btn-link danger cvr-remove-entry"
              onClick={() => removeWorkEntry(wi)}
            >
              Remove this role
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-small" onClick={addWorkEntry}>
          Add another role
        </button>
      </div>

      {/* Skills */}
      <div className="cvr-section card">
        <h3 className="section-title cvr-section-heading">Skills</h3>
        <div className="cvr-chips">
          {view.skills.map((skill) => (
            <span key={skill} className="chip cvr-skill-chip">
              {skill}
              <button
                type="button"
                className="cvi-chip-remove btn-link"
                aria-label={`Remove ${skill}`}
                onClick={() => removeSkill(skill)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <SkillAdder onAdd={addSkill} />
      </div>

      {/* Education */}
      {(view.education.length > 0 || true) && (
        <div className="cvr-section card">
          <h3 className="section-title cvr-section-heading">Education</h3>
          {view.education.map((entry, ei) => (
            <div key={ei} className="cvr-entry">
              <div className="row gap wrap cvr-entry-head">
                <input
                  className="input"
                  placeholder="School or programme"
                  value={entry.institution}
                  onChange={(e) => setEducationField(ei, 'institution', e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Subject / major"
                  value={entry.area ?? ''}
                  onChange={(e) => setEducationField(ei, 'area', e.target.value || '')}
                />
                <input
                  className="input cvr-date"
                  placeholder="Year"
                  value={entry.year ?? ''}
                  onChange={(e) => setEducationField(ei, 'year', e.target.value || '')}
                />
              </div>
              <button
                type="button"
                className="btn-link danger cvr-remove-entry"
                onClick={() => removeEducationEntry(ei)}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-small" onClick={addEducationEntry}>
            Add education
          </button>
        </div>
      )}

      {/* Projects */}
      <div className="cvr-section card">
        <h3 className="section-title cvr-section-heading">Projects</h3>
        {view.projects.map((project, pi) => (
          <div key={pi} className="cvr-entry">
            <div className="row gap wrap cvr-entry-head">
              <input
                className="input"
                placeholder="Project name"
                value={project.name}
                onChange={(e) => setProjectField(pi, 'name', e.target.value)}
              />
              <input
                className="input"
                placeholder="URL (optional)"
                value={project.url ?? ''}
                onChange={(e) => setProjectField(pi, 'url', e.target.value || '')}
              />
            </div>
            <textarea
              className="input"
              rows={2}
              placeholder="What is it?"
              value={project.description ?? ''}
              onChange={(e) => setProjectField(pi, 'description', e.target.value || '')}
            />
            <div className="cvr-bullets">
              {project.highlights.map((bullet, bi) => (
                <div key={bi} className="row gap cvr-bullet-row">
                  <input
                    className="input"
                    value={bullet}
                    placeholder="A highlight"
                    onChange={(e) => setProjectBullet(pi, bi, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-link danger"
                    aria-label="Remove bullet"
                    onClick={() => removeProjectBullet(pi, bi)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-small" onClick={() => addProjectBullet(pi)}>
                Add highlight
              </button>
            </div>
            <button
              type="button"
              className="btn-link danger cvr-remove-entry"
              onClick={() => removeProjectEntry(pi)}
            >
              Remove project
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-small" onClick={addProjectEntry}>
          Add project
        </button>
      </div>

      {/* Validity hint */}
      {!isValid && (
        <p className="form-error" role="alert">
          {view.name.trim() === '' ? 'A name is required.' : validation.ok ? '' : validation.errors[0]?.message ?? 'Something is missing.'}
        </p>
      )}

      {/* Actions */}
      <div className="cvr-actions row gap section">
        <button
          className="btn btn-primary"
          disabled={!isValid || busy}
          onClick={() => onConfirm(cvJson)}
        >
          This looks right
        </button>
        {onRegenerate && (
          <button className="btn" disabled={busy} onClick={onRegenerate}>
            Regenerate
          </button>
        )}
        <button className="btn-link" onClick={onStartOver}>
          Start over
        </button>
      </div>
    </div>
  )
}

function SkillAdder({ onAdd }: { onAdd: (skill: string) => void }) {
  const [draft, setDraft] = useState('')
  function commit() {
    const vals = draft
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean)
    for (const v of vals) onAdd(v)
    setDraft('')
  }
  return (
    <div className="row gap">
      <input
        className="input"
        placeholder="Add a skill…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault()
            commit()
          }
        }}
      />
      <button type="button" className="btn btn-small" disabled={!draft.trim()} onClick={commit}>
        Add
      </button>
    </div>
  )
}
