'use client'

import { useState } from 'react'
import {
  buildCVExtractPrompt,
  parseCVResult,
  cvToView,
  validateCVJson,
  type CVView,
} from '@ghosted/core'
import { useAIAuth } from '../lib/useAIAuth'
import { useModelChoice } from '../lib/useModelChoice'
import { ConnectAI } from './ConnectAI'
import { ModelPicker } from './ModelPicker'
import { CVInterview } from './CVInterview'
import { CVReview } from './CVReview'

// CVBuilder — the step-0 panel in onboarding.
// Three modes: interview (default), upload/paste, paste-JSON (advanced).
// Interview and upload require an AI connection; paste-JSON is always available.

export interface CVBuilderProps {
  cvJson?: string | null
  onConfirm: (cvJson: string) => void
}

type Mode = 'interview' | 'upload' | 'json'
type Stage = 'mode-select' | 'build' | 'review'

export function CVBuilder({ cvJson, onConfirm }: CVBuilderProps) {
  const { auth, connect } = useAIAuth()
  const { model: chosenModel } = useModelChoice()

  const [mode, setMode] = useState<Mode>('interview')
  const [stage, setStage] = useState<Stage>('mode-select')
  const [reviewView, setReviewView] = useState<CVView | null>(null)
  const [lastAnswers, setLastAnswers] = useState<unknown>(null)
  const [lastExtractText, setLastExtractText] = useState<string | null>(null)

  // Upload-path state
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  const [pasteText, setPasteText] = useState('')

  // Paste-JSON path state
  const [jsonText, setJsonText] = useState(cvJson ?? '')
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Interview path busy flag (lifted so the build button can be disabled)
  const [interviewBusy, setInterviewBusy] = useState(false)

  // Check whether upload/interview need a connection
  const needsConnection = (mode === 'interview' || mode === 'upload') && !auth

  async function callModel(prompt: string): Promise<string> {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        auth,
        prompt,
        task: 'cv',
        ...(chosenModel ? { model: chosenModel } : {}),
      }),
    })
    const data = (await res.json()) as { text?: string; error?: string }
    if (!res.ok || !data.text) throw new Error(data.error ?? 'Generation failed')
    return data.text
  }

  async function handleUpload() {
    setUploadError(null)
    setUploadWarnings([])
    setUploadBusy(true)

    try {
      // Collect sources
      const sources: { kind: 'text' | 'pdf'; data: string; filename?: string }[] = []

      const fileInput = document.getElementById('cvb-file') as HTMLInputElement | null
      const files = fileInput?.files ?? ([] as unknown as FileList)

      for (const file of files) {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          const ab = await file.arrayBuffer()
          const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)))
          sources.push({ kind: 'pdf', data: b64, filename: file.name })
        } else {
          const text = await file.text()
          sources.push({ kind: 'text', data: text, filename: file.name })
        }
      }

      if (pasteText.trim()) {
        sources.push({ kind: 'text', data: pasteText })
      }

      if (sources.length === 0) {
        setUploadError('Please pick a file or paste your résumé text.')
        return
      }

      // Extract text from files
      const extractRes = await fetch('/api/cv/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sources }),
      })
      const extractData = (await extractRes.json()) as { text?: string; warnings?: string[]; error?: string }
      if (!extractRes.ok || !extractData.text) {
        setUploadError(extractData.error ?? 'Could not read the file.')
        return
      }

      if (extractData.warnings?.length) {
        setUploadWarnings(extractData.warnings)
      }

      setLastExtractText(extractData.text)

      // Build CV from text
      const prompt = buildCVExtractPrompt(extractData.text)
      const raw = await callModel(prompt)
      const result = parseCVResult(raw)

      if (!result.ok) {
        setUploadError(`Could not build a CV from that file: ${result.error}. Try pasting the text instead.`)
        return
      }

      const view = cvToView(result.cvJson)
      if (!view) {
        setUploadError('The file did not contain a recognisable name. Check the résumé and try again.')
        return
      }

      setReviewView(view)
      setStage('review')
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setUploadBusy(false)
    }
  }

  async function handleRegenerateFromText() {
    if (!lastExtractText) return
    setUploadBusy(true)
    setUploadError(null)
    try {
      const prompt = buildCVExtractPrompt(lastExtractText)
      const raw = await callModel(prompt)
      const result = parseCVResult(raw)
      if (!result.ok) {
        setUploadError(`Regeneration failed: ${result.error}`)
        return
      }
      const view = cvToView(result.cvJson)
      if (!view) {
        setUploadError('Regeneration produced an unrecognisable result. Try editing the preview manually.')
        return
      }
      setReviewView(view)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setUploadBusy(false)
    }
  }

  function handleJsonConfirm() {
    const validation = validateCVJson(jsonText)
    if (!validation.ok) {
      setJsonError(validation.errors[0]?.message ?? 'Invalid CV')
      return
    }
    setJsonError(null)
    onConfirm(jsonText)
  }

  function handleConfirmReview(json: string) {
    onConfirm(json)
  }

  // In review stage — show CVReview
  if (stage === 'review' && reviewView) {
    return (
      <CVReview
        initial={reviewView}
        onConfirm={handleConfirmReview}
        onStartOver={() => {
          setStage('mode-select')
          setReviewView(null)
        }}
        onRegenerate={
          mode === 'upload' && lastExtractText
            ? () => void handleRegenerateFromText()
            : undefined
        }
        busy={uploadBusy}
      />
    )
  }

  return (
    <div className="cvb-wrap">
      {/* Mode segmented control */}
      {stage === 'mode-select' && (
        <>
          <div className="cvb-mode-tabs row gap" role="tablist" aria-label="CV building method">
            <button
              role="tab"
              aria-selected={mode === 'interview'}
              className={`cvb-tab${mode === 'interview' ? ' cvb-tab-active' : ''}`}
              onClick={() => setMode('interview')}
            >
              Answer a few questions
            </button>
            <button
              role="tab"
              aria-selected={mode === 'upload'}
              className={`cvb-tab${mode === 'upload' ? ' cvb-tab-active' : ''}`}
              onClick={() => setMode('upload')}
            >
              Use my old résumé
            </button>
          </div>
          <button
            className="btn-link cvb-advanced-toggle"
            onClick={() => setMode(mode === 'json' ? 'interview' : 'json')}
          >
            {mode === 'json' ? 'Back to guided setup' : 'Advanced: paste JSON'}
          </button>
        </>
      )}

      {/* Connection gate for AI modes */}
      {needsConnection && (
        <div className="card cvb-connect-gate">
          <p className="dim small">Connect your AI to build your CV automatically.</p>
          <ConnectAI onConnect={connect} />
        </div>
      )}

      {/* Interview mode */}
      {mode === 'interview' && !needsConnection && (
        <>
          <div className="cvb-model-row row gap">
            <ModelPicker />
          </div>
          {stage === 'build' ? (
            <CVInterview
              onReview={(view) => {
                setReviewView(view)
                setStage('review')
              }}
              callModel={callModel}
              busy={interviewBusy}
              setBusy={setInterviewBusy}
            />
          ) : (
            <div className="cvb-start card">
              <p className="dim small">
                Answer a handful of questions about your background. The AI turns your answers into a structured CV — no formatting required on your end.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => setStage('build')}
              >
                Start the questions
              </button>
            </div>
          )}
        </>
      )}

      {/* Upload / paste mode */}
      {mode === 'upload' && !needsConnection && (
        <div>
          <div className="cvb-model-row row gap">
            <ModelPicker />
          </div>
          <label className="field">
            <span className="field-label">Your résumé file (PDF, TXT, or Markdown)</span>
            <input
              id="cvb-file"
              type="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown"
              multiple
            />
          </label>
          <label className="field">
            <span className="field-label">Or paste your résumé text</span>
            <textarea
              className="input"
              rows={6}
              placeholder="Paste the full text of your résumé here…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
          </label>
          {uploadWarnings.length > 0 && (
            <p className="dim small cvb-warnings">
              {uploadWarnings.join(' · ')}
            </p>
          )}
          {uploadError && (
            <p className="form-error" role="alert">
              {uploadError}
            </p>
          )}
          <div className="row gap section">
            <button
              className="btn btn-primary"
              disabled={uploadBusy}
              onClick={() => void handleUpload()}
            >
              {uploadBusy ? 'Reading…' : 'Read my résumé'}
            </button>
          </div>
        </div>
      )}

      {/* Paste-JSON mode (advanced) */}
      {mode === 'json' && (
        <div className="cvb-json-panel">
          <p className="dim small">
            Paste a JSON Resume or pick a <span className="mono">.json</span> file.
          </p>
          <input
            type="file"
            accept="application/json,.json"
            aria-label="CV JSON file"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                const text = await f.text()
                setJsonText(text)
                setJsonError(null)
              }
            }}
          />
          <textarea
            className="input mono cv-paste"
            rows={8}
            placeholder='{"basics":{"name":"…"},"work":[…],"skills":[…]}'
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value)
              setJsonError(null)
            }}
          />
          {jsonText && (() => {
            const v = validateCVJson(jsonText)
            return !v.ok ? (
              <p className="form-error" role="alert">
                {v.errors[0]?.message}
              </p>
            ) : null
          })()}
          {jsonError && (
            <p className="form-error" role="alert">
              {jsonError}
            </p>
          )}
          <div className="row gap section">
            <button
              className="btn btn-primary"
              disabled={!jsonText || !validateCVJson(jsonText).ok}
              onClick={handleJsonConfirm}
            >
              Use this CV
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
