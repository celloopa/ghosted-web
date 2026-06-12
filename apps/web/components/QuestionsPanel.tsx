'use client'

import { useState } from 'react'
import { checkAnswer } from '@ghosted/core'
import type { Materials } from '@ghosted/core'

type QAItem = NonNullable<Materials['qa']>[number]

export function QuestionsPanel({
  qa,
  busy,
  onDraft,
  onRevise,
  onEdit,
  onRemove,
  onCopy,
  onDownloadAll,
}: {
  qa: QAItem[]
  busy: boolean
  onDraft: (question: string) => void
  onRevise: (index: number, instruction: string) => void
  onEdit: (index: number, answer: string) => void
  onRemove: (index: number) => void
  onCopy: (text: string) => void
  onDownloadAll: () => void
}) {
  const [newQuestion, setNewQuestion] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [reviseIndex, setReviseIndex] = useState<number | null>(null)
  const [reviseDraft, setReviseDraft] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  function handleDraft() {
    const q = newQuestion.trim()
    if (!q || busy) return
    onDraft(q)
    setNewQuestion('')
  }

  function handleCopy(index: number, text: string) {
    onCopy(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 1500)
  }

  function handleEditSave(index: number) {
    onEdit(index, editDraft)
    setEditingIndex(null)
    setEditDraft('')
  }

  function handleReviseSubmit(index: number) {
    const instruction = reviseDraft.trim()
    if (!instruction) return
    onRevise(index, instruction)
    setReviseIndex(null)
    setReviseDraft('')
  }

  return (
    <div className="questions-panel">
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h3 className="section-title" style={{ margin: 0 }}>Application questions</h3>
        <button
          className="btn btn-small"
          disabled={qa.length === 0}
          onClick={onDownloadAll}
          aria-label="Download all Q&A as markdown"
        >
          Download all
        </button>
      </div>

      {/* Add row */}
      <div className="row gap questions-add-row" style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="Paste a question from the application form…"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleDraft()}
          disabled={busy}
          aria-label="Application form question"
        />
        <button
          className="btn"
          disabled={busy || !newQuestion.trim()}
          onClick={handleDraft}
        >
          {busy ? 'Drafting…' : 'Draft answer'}
        </button>
      </div>

      {/* Q&A cards */}
      {qa.length === 0 && (
        <p className="dim small">No questions yet. Paste a question from the form above to draft an answer.</p>
      )}

      {qa.map((item, index) => {
        const check = item.answer ? checkAnswer(item.answer) : null
        const isEditing = editingIndex === index
        const isRevising = reviseIndex === index
        const isCopied = copiedIndex === index

        return (
          <div key={index} className="suggestion-card reveal questions-card" data-testid={`qa-card-${index}`}>
            <p style={{ fontWeight: 500, margin: '0 0 8px' }}>{item.question}</p>

            {isEditing ? (
              <>
                <textarea
                  className="input"
                  rows={5}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  aria-label="Edit answer"
                />
                <div className="row gap" style={{ marginTop: 6 }}>
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => handleEditSave(index)}
                  >
                    Save
                  </button>
                  <button className="btn-link" onClick={() => { setEditingIndex(null); setEditDraft('') }}>
                    cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{item.answer}</p>

                {/* Validation badges */}
                {check && (
                  <div className="row gap wrap" style={{ marginBottom: 6 }}>
                    <span className="dim small mono">{check.words} words</span>
                    {check.overLimit && (
                      <span className="badge kw-missing">over {150} words</span>
                    )}
                    {check.banned.map((b) => (
                      <span key={b} className="badge kw-missing">banned: {b}</span>
                    ))}
                  </div>
                )}

                {/* Card actions */}
                <div className="row gap" style={{ marginTop: 4 }}>
                  <button
                    className="btn btn-small"
                    onClick={() => handleCopy(index, item.answer)}
                    aria-label={`Copy answer ${index + 1}`}
                  >
                    {isCopied ? 'copied' : 'Copy'}
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setEditDraft(item.answer)
                      setEditingIndex(index)
                      setReviseIndex(null)
                    }}
                    aria-label={`Edit answer ${index + 1}`}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setReviseIndex(reviseIndex === index ? null : index)
                      setReviseDraft('')
                    }}
                    aria-label={`Revise answer ${index + 1}`}
                  >
                    Revise
                  </button>
                  <button
                    className="btn-link"
                    onClick={() => onRemove(index)}
                    aria-label={`Remove question ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>

                {/* Inline revise row */}
                {isRevising && (
                  <div className="row gap" style={{ marginTop: 8 }}>
                    <input
                      className="input"
                      placeholder='Revision note — "be more specific", "shorten it"…'
                      value={reviseDraft}
                      onChange={(e) => setReviseDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleReviseSubmit(index)}
                      disabled={busy}
                      aria-label={`Revision instruction for question ${index + 1}`}
                    />
                    <button
                      className="btn btn-small"
                      disabled={busy || !reviseDraft.trim()}
                      onClick={() => handleReviseSubmit(index)}
                    >
                      {busy ? '…' : 'Go'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
