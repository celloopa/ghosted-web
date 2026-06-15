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

// Upload-path busy state strings
type UploadBusyState = false | 'reading' | 'vision' | 'building'

type CVSource = { kind: 'pdf' | 'text'; data: string; filename?: string }

export function CVBuilder({ cvJson, onConfirm }: CVBuilderProps) {
  const { auth, connect } = useAIAuth()
  const { model: chosenModel } = useModelChoice()

  const [mode, setMode] = useState<Mode>('interview')
  const [stage, setStage] = useState<Stage>('mode-select')
  const [reviewView, setReviewView] = useState<CVView | null>(null)
  const [lastAnswers, setLastAnswers] = useState<unknown>(null)
  const [lastExtractText, setLastExtractText] = useState<string | null>(null)

  // Upload-path state
  const [uploadBusy, setUploadBusy] = useState<UploadBusyState>(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  const [pasteText, setPasteText] = useState('')
  // Vision note shown when auto-fallback fires
  const [visionNote, setVisionNote] = useState<string | null>(null)
  // Keep sources in state so re-runs need no re-upload
  const [lastSources, setLastSources] = useState<CVSource[] | null>(null)

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

  async function runVisionPath(sources: CVSource[]): Promise<void> {
    setUploadBusy('vision')
    setUploadError(null)

    const visionRes = await fetch('/api/cv/vision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(auth ? { auth } : {}),
        ...(chosenModel ? { model: chosenModel } : {}),
        sources,
      }),
    })
    const visionData = (await visionRes.json()) as { text?: string; warnings?: string[]; error?: string }

    if (!visionRes.ok || !visionData.text) {
      const msg = visionData.error ?? 'Could not read the page images.'
      // Detect local-CLI-can't-read messages and point to API key
      if (msg.toLowerCase().includes('local') || msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('connect')) {
        setUploadError(`${msg} Connect an API key to use the image-reading path.`)
      } else {
        setUploadError(msg)
      }
      return
    }

    if (visionData.warnings?.length) {
      setUploadWarnings((prev) => [...prev, ...visionData.warnings!])
    }

    const result = parseCVResult(visionData.text)
    if (!result.ok) {
      setUploadError(`Could not build a CV from the page images: ${result.error}. Try pasting the text instead.`)
      return
    }

    const view = cvToView(result.cvJson)
    if (!view) {
      setUploadError('The page images did not contain a recognisable name. Check the résumé and try again.')
      return
    }

    setReviewView(view)
    setStage('review')
  }

  async function handleUpload() {
    setUploadError(null)
    setUploadWarnings([])
    setVisionNote(null)
    setUploadBusy('reading')

    try {
      // Collect sources
      const sources: CVSource[] = []

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
        sources.push({ kind: 'text', data: pasteText, filename: 'pasted' })
      }

      if (sources.length === 0) {
        setUploadError('Please pick a file or paste your résumé text.')
        setUploadBusy(false)
        return
      }

      // Save sources for later re-runs (vision escape hatch or manual retry)
      setLastSources(sources)

      // Extract text from files
      const extractRes = await fetch('/api/cv/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sources }),
      })
      const extractData = (await extractRes.json()) as {
        text?: string
        warnings?: string[]
        needsVision?: boolean
        error?: string
      }
      if (!extractRes.ok) {
        setUploadError(extractData.error ?? 'Could not read the file.')
        setUploadBusy(false)
        return
      }

      if (extractData.warnings?.length) {
        setUploadWarnings(extractData.warnings)
      }

      // Automatic vision fallback
      if (extractData.needsVision) {
        setVisionNote('This résumé looks image-based — reading it from the page images instead.')
        await runVisionPath(sources)
        return
      }

      if (!extractData.text) {
        setUploadError('Could not read the file.')
        setUploadBusy(false)
        return
      }

      setLastExtractText(extractData.text)

      // Build CV from text
      setUploadBusy('building')
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

  async function handleRunVision() {
    if (!lastSources) return
    setUploadError(null)
    setVisionNote(null)
    setUploadWarnings([])
    try {
      await runVisionPath(lastSources)
    } finally {
      setUploadBusy(false)
    }
  }

  async function handleRegenerateFromText() {
    if (!lastExtractText) return
    setUploadBusy('building')
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

  const isBusy = uploadBusy !== false

  function busyLabel(): string {
    if (uploadBusy === 'reading') return 'Reading…'
    if (uploadBusy === 'vision') return 'Looking at the pages…'
    if (uploadBusy === 'building') return 'Building…'
    return 'Read my résumé'
  }

  // In review stage — show CVReview
  if (stage === 'review' && reviewView) {
    return (
      <>
        {lastSources && (
          <p className="cvb-vision-escape dim small">
            Didn&rsquo;t read right?{' '}
            <button
              className="btn-link"
              disabled={isBusy}
              onClick={() => void handleRunVision()}
            >
              Read it from the page images instead
            </button>
          </p>
        )}
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
          busy={isBusy}
        />
        {uploadError && (
          <p className="form-error" role="alert">
            {uploadError}
          </p>
        )}
      </>
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
          <div className="field">
            <label htmlFor="cvb-file" className="field-label">Your résumé file (PDF, TXT, or Markdown)</label>
            <p className="dim small cvb-multi-hint">Add one or more résumés — even a few versions. We read them all.</p>
            <input
              id="cvb-file"
              type="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown"
              multiple
            />
          </div>
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
          {visionNote && (
            <p className="dim small cvb-vision-note" role="status">
              {visionNote}
            </p>
          )}
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
              disabled={isBusy}
              onClick={() => void handleUpload()}
            >
              {busyLabel()}
            </button>
          </div>
          {lastSources && !isBusy && (
            <p className="dim small cvb-vision-escape">
              Didn&rsquo;t read right?{' '}
              <button
                className="btn-link"
                onClick={() => void handleRunVision()}
              >
                Read it from the page images instead
              </button>
            </p>
          )}
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
