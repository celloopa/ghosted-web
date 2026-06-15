'use client'

import { useState } from 'react'
import { INTERVIEW_QUESTIONS, buildCVInterviewPrompt, parseCVResult, cvToView, type CVView } from '@ghosted/core'

// CVInterview renders the guided question form and calls the model when the
// user is ready. It never shows raw JSON to the user — answers go in as
// natural text and come back as a structured CVView handed up to Review.

export interface CVInterviewProps {
  onReview: (view: CVView) => void
  callModel: (prompt: string) => Promise<string>
  busy: boolean
  setBusy: (b: boolean) => void
}

type RepeatableEntry = Record<string, string>
type AnswerMap = Record<string, string | string[] | RepeatableEntry[]>

function emptyEntry(sectionId: string): RepeatableEntry {
  const section = INTERVIEW_QUESTIONS.find((s) => s.id === sectionId)
  if (!section) return {}
  return Object.fromEntries(section.fields.map((f) => [f.id, '']))
}

export function CVInterview({ onReview, callModel, busy, setBusy }: CVInterviewProps) {
  // Scalar answers (text/textarea/list) keyed by "sectionId.fieldId"
  // Repeatable sections keyed by sectionId as arrays of entry objects
  const [answers, setAnswers] = useState<AnswerMap>(() => {
    const init: AnswerMap = {}
    for (const section of INTERVIEW_QUESTIONS) {
      if (section.repeatable) {
        init[section.id] = [emptyEntry(section.id)]
      } else {
        for (const field of section.fields) {
          const key = `${section.id}.${field.id}`
          init[key] = field.kind === 'list' ? [] : ''
        }
      }
    }
    return init
  })

  const [listDrafts, setListDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function setScalar(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  function setListEntry(key: string, index: number, value: string) {
    setAnswers((prev) => {
      const current = (prev[key] as string[]) ?? []
      const next = [...current]
      next[index] = value
      return { ...prev, [key]: next.filter((v) => v.trim() !== '') }
    })
  }

  function setRepeatableField(sectionId: string, entryIndex: number, fieldId: string, value: string) {
    setAnswers((prev) => {
      const entries = [...((prev[sectionId] as RepeatableEntry[]) ?? [])]
      entries[entryIndex] = { ...entries[entryIndex], [fieldId]: value }
      return { ...prev, [sectionId]: entries }
    })
  }

  function addEntry(sectionId: string) {
    setAnswers((prev) => {
      const entries = [...((prev[sectionId] as RepeatableEntry[]) ?? [])]
      entries.push(emptyEntry(sectionId))
      return { ...prev, [sectionId]: entries }
    })
  }

  function removeEntry(sectionId: string, index: number) {
    setAnswers((prev) => {
      const entries = [...((prev[sectionId] as RepeatableEntry[]) ?? [])]
      if (entries.length <= 1) return prev
      entries.splice(index, 1)
      return { ...prev, [sectionId]: entries }
    })
  }

  async function build() {
    setError(null)
    setBusy(true)
    try {
      const prompt = buildCVInterviewPrompt(answers)
      const raw = await callModel(prompt)
      const result = parseCVResult(raw)
      if (!result.ok) {
        setError(`Could not build your CV: ${result.error}. Try adding more detail to your answers.`)
        return
      }
      const view = cvToView(result.cvJson)
      if (!view) {
        setError('The result was missing a name. Please fill in the "About you" section and try again.')
        return
      }
      onReview(view)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cvi-form">
      {INTERVIEW_QUESTIONS.map((section) => (
        <section key={section.id} className="cvi-section">
          <h3 className="cvi-section-title">{section.title}</h3>
          {section.help && <p className="dim small cvi-help">{section.help}</p>}

          {section.repeatable ? (
            // Repeatable sections: work / education / projects
            <>
              {((answers[section.id] as RepeatableEntry[]) ?? [emptyEntry(section.id)]).map(
                (entry, entryIdx) => (
                  <div key={entryIdx} className="cvi-entry card">
                    {section.fields.map((field) => (
                      <label key={field.id} className="field">
                        <span className="field-label">{field.label}</span>
                        {field.kind === 'textarea' ? (
                          <textarea
                            className="input"
                            rows={4}
                            placeholder={field.placeholder}
                            value={entry[field.id] ?? ''}
                            onChange={(e) =>
                              setRepeatableField(section.id, entryIdx, field.id, e.target.value)
                            }
                          />
                        ) : (
                          <input
                            className="input"
                            placeholder={field.placeholder}
                            value={entry[field.id] ?? ''}
                            onChange={(e) =>
                              setRepeatableField(section.id, entryIdx, field.id, e.target.value)
                            }
                          />
                        )}
                        {field.help && <span className="dim small">{field.help}</span>}
                      </label>
                    ))}
                    {(answers[section.id] as RepeatableEntry[]).length > 1 && (
                      <button
                        type="button"
                        className="btn-link danger"
                        onClick={() => removeEntry(section.id, entryIdx)}
                      >
                        Remove this entry
                      </button>
                    )}
                  </div>
                ),
              )}
              <button type="button" className="btn btn-small" onClick={() => addEntry(section.id)}>
                Add another {section.title.toLowerCase().replace(/s$/, '')}
              </button>
            </>
          ) : (
            // Non-repeatable: basics / summary / skills
            section.fields.map((field) => {
              const key = `${section.id}.${field.id}`
              if (field.kind === 'list') {
                const items = (answers[key] as string[]) ?? []
                const draft = listDrafts[key] ?? ''
                return (
                  <div key={field.id} className="field">
                    <span className="field-label">{field.label}</span>
                    {field.help && <p className="dim small">{field.help}</p>}
                    <div className="cvi-chips">
                      {items.map((item, i) => (
                        <span key={i} className="chip cvi-chip">
                          {item}
                          <button
                            type="button"
                            className="cvi-chip-remove btn-link"
                            aria-label={`Remove ${item}`}
                            onClick={() => setListEntry(key, i, '')}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="row gap">
                      <input
                        className="input"
                        placeholder={field.placeholder}
                        value={draft}
                        onChange={(e) =>
                          setListDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && draft.trim()) {
                            e.preventDefault()
                            const vals = draft
                              .split(/[\n,]/)
                              .map((v) => v.trim())
                              .filter(Boolean)
                            setAnswers((prev) => ({
                              ...prev,
                              [key]: [...((prev[key] as string[]) ?? []), ...vals],
                            }))
                            setListDrafts((prev) => ({ ...prev, [key]: '' }))
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!draft.trim()}
                        onClick={() => {
                          const vals = draft
                            .split(/[\n,]/)
                            .map((v) => v.trim())
                            .filter(Boolean)
                          if (!vals.length) return
                          setAnswers((prev) => ({
                            ...prev,
                            [key]: [...((prev[key] as string[]) ?? []), ...vals],
                          }))
                          setListDrafts((prev) => ({ ...prev, [key]: '' }))
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )
              }
              return (
                <label key={field.id} className="field">
                  <span className="field-label">{field.label}</span>
                  {field.kind === 'textarea' ? (
                    <textarea
                      className="input"
                      rows={3}
                      placeholder={field.placeholder}
                      value={(answers[key] as string) ?? ''}
                      onChange={(e) => setScalar(key, e.target.value)}
                    />
                  ) : (
                    <input
                      className="input"
                      placeholder={field.placeholder}
                      value={(answers[key] as string) ?? ''}
                      onChange={(e) => setScalar(key, e.target.value)}
                    />
                  )}
                  {field.help && <span className="dim small">{field.help}</span>}
                </label>
              )
            })
          )}
        </section>
      ))}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="row gap section">
        <button className="btn btn-primary" disabled={busy} onClick={() => void build()}>
          {busy ? 'Building your CV…' : 'Build my CV'}
        </button>
      </div>
    </div>
  )
}
