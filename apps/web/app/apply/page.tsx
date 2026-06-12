'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  analyzeFit,
  buildGenerationPrompt,
  checkCoverLetter,
  checkDraftHonesty,
  estimateCostUSD,
  findCatalogEntry,
  FALLBACK_MODEL_CATALOG,
  modelForAuth,
  parseGeneration,
  parsePostingHTML,
  planResume,
  renderResumeAdjustments,
  type Application,
  type FitReport,
  type GenerationInput,
  type HonestyReport,
  type Materials,
  type PostingFacts,
  type RewriteDecision,
  type RoleType,
} from '@ghosted/core'
import { useApps } from '../../lib/useApps'
import { useBaseline } from '../../lib/useBaseline'
import { useAIAuth } from '../../lib/useAIAuth'
import { ConnectAI } from '../../components/ConnectAI'
import { ModelPicker } from '../../components/ModelPicker'
import { RewritesPanel } from '../../components/RewritesPanel'
import { StandoutsPanel } from '../../components/StandoutsPanel'
import { todayISO } from '../../lib/dates'
import { buildDownloadName, buildExportPayload, defaultView, finaleActions, isStaleExport, type WorkspaceView } from '../../lib/applyHelpers'
import { useModelChoice } from '../../lib/useModelChoice'
import { useDocStyle, DEFAULT_ACCENT_COLOR } from '../../lib/useDocStyle'

// The apply workspace. Minimum viable intelligence: everything on this page
// is deterministic — fetch, parse, keywords, fit, bullet order, validation —
// except ONE bounded model call that writes the summary line and the letter.

const ROLE_CHIPS: { value: RoleType; label: string }[] = [
  { value: 'design_engineer', label: 'Design Engineer' },
  { value: 'product_designer', label: 'Product Designer' },
  { value: 'brand_motion', label: 'Brand / Motion' },
  { value: 'other', label: 'Other' },
]

const APPLY_STEPS = [
  { id: 'posting', label: 'Posting', detail: 'Read the role' },
  { id: 'fit', label: 'Fit check', detail: 'Confirm target' },
  { id: 'materials', label: 'Materials', detail: 'Draft and revise' },
] as const

type ApplyStep = (typeof APPLY_STEPS)[number]['id']

export default function ApplyPage() {
  return (
    <Suspense fallback={null}>
      <Apply />
    </Suspense>
  )
}

function Apply() {
  const params = useSearchParams()
  const appId = params.get('id')
  const { apps } = useApps()
  const { baseline } = useBaseline()

  if (apps === null || baseline === null) return null
  const existing = appId ? apps.find((a) => a.id === appId) : undefined

  if (existing?.posting) {
    return <Workspace app={existing} />
  }
  return <Analyze {...(existing ? { existing } : {})} />
}

function ApplyFlowChrome({
  step,
  company,
  position,
  status,
}: {
  step: ApplyStep
  company?: string
  position?: string
  status?: string
}) {
  const activeIndex = APPLY_STEPS.findIndex((s) => s.id === step)
  return (
    <div className="apply-chrome motion-in">
      <div className="apply-context">
        <div>
          <p className="eyebrow">Apply workspace</p>
          <h1 className="page-title">{company || 'New application'}</h1>
          <p className="dim">{position || 'Start with a posting, then Ghosted will keep the application in view.'}</p>
        </div>
        {status && <span className="apply-status">{status}</span>}
      </div>
      <div className="apply-steps" aria-label="Apply progress">
        {APPLY_STEPS.map((s, i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'upcoming'
          return (
            <div key={s.id} className={`apply-step apply-step-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              <span className="apply-step-dot">{i + 1}</span>
              <span>
                <span className="apply-step-label">{s.label}</span>
                <span className="apply-step-detail">{s.detail}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LoadingPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="card loading-panel" role="status" aria-live="polite">
      <div className="loading-bar" aria-hidden />
      <p className="section-title">{title}</p>
      <p className="dim small">{detail}</p>
      <div className="skeleton-lines" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

// ---- Stage 1+2: drop a URL (or paste), review the deterministic analysis ----

function Analyze({ existing }: { existing?: Application }) {
  const { addApplication, updateApplication } = useApps()
  const { baseline } = useBaseline()

  const [url, setUrl] = useState(existing?.job_url ?? '')
  const [pasteMode, setPasteMode] = useState(false)
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [facts, setFacts] = useState<PostingFacts | null>(null)
  const [fit, setFit] = useState<FitReport | null>(null)
  const [company, setCompany] = useState(existing?.company ?? '')
  const [position, setPosition] = useState(existing?.position ?? '')
  const [roleType, setRoleType] = useState<RoleType | null>(existing?.role_type ?? null)

  const cvJson = baseline?.cv_json ?? ''
  const constraints = baseline?.constraints ?? { role_types_in: [] }

  async function analyze() {
    setError(null)
    setBusy(true)
    try {
      let f: PostingFacts
      if (pasteMode) {
        if (pasted.trim().length < 100) {
          setError('That looks too short to be a posting.')
          return
        }
        f = parsePostingHTML(pasted)
      } else {
        const res = await fetch('/api/posting', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        })
        const data = (await res.json()) as { facts?: PostingFacts; error?: string }
        if (!res.ok || !data.facts) {
          setError(data.error ?? 'could not fetch that URL')
          if (data.error?.includes('paste')) setPasteMode(true)
          return
        }
        f = data.facts
      }
      const report = analyzeFit(f, cvJson, constraints)
      setFacts(f)
      setFit(report)
      setCompany((c) => c || f.company || '')
      setPosition((p) => p || f.position || '')
      setRoleType((r) => r ?? report.role_type_guess)
    } finally {
      setBusy(false)
    }
  }

  async function track() {
    if (!facts || !fit || tracking) return
    if (!company.trim() || !position.trim()) return setError('Company and position are required.')
    if (!roleType) return setError('Pick a role type.')
    setError(null)
    setTracking(true)

    const posting = {
      ...(url.trim() && !pasteMode ? { url: url.trim() } : {}),
      description: facts.description,
      fit_score: fit.score,
      fit_notes: fit.notes,
      matched: fit.matched,
      missing: fit.missing,
      analyzed_at: todayISO(),
    }

    try {
      if (existing) {
        const updated: Application = { ...existing, company: company.trim(), position: position.trim(), role_type: roleType, needs_materials: true, posting }
        if (posting.url) updated.job_url = posting.url
        await updateApplication(updated)
        window.location.assign(`/apply?id=${existing.id}`)
        return
      }

      const app: Application = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `app-${Math.random().toString(36).slice(2)}`,
        company: company.trim(),
        position: position.trim(),
        role_type: roleType,
        status: 'saved',
        needs_materials: true,
        posting,
        events: [],
      }
      if (posting.url) {
        app.job_url = posting.url
        if (facts.source) app.source = facts.source
      }
      if (facts.location) app.location = facts.location
      if (facts.remote !== undefined) app.remote = facts.remote
      if (facts.salary_min) app.salary_min = facts.salary_min
      if (facts.salary_max) app.salary_max = facts.salary_max
      await addApplication(app)
      window.location.assign(`/apply?id=${app.id}`)
    } catch (e) {
      setTracking(false)
      setError(e instanceof Error ? e.message : 'Could not track this application.')
    }
  }

  const currentStep: ApplyStep = facts && fit ? 'fit' : 'posting'
  const activeCompany = company.trim() || existing?.company
  const activePosition = position.trim() || existing?.position

  return (
    <div className="narrow apply-flow">
      <ApplyFlowChrome
        step={currentStep}
        company={activeCompany}
        position={activePosition}
        status={busy ? 'Reading posting' : tracking ? 'Opening workspace' : facts && fit ? 'Ready to track' : 'Waiting for posting'}
      />
      <p className="dim">
        Drop the posting URL. Ghosted parses, scores, and prepares the handoff locally before any model writes prose.
      </p>

      {!pasteMode ? (
        <div className="field">
          <input
            className="input"
            placeholder="https://… the job posting"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            onKeyDown={(e) => e.key === 'Enter' && analyze()}
          />
          <button className="btn-link" onClick={() => setPasteMode(true)}>
            or paste the posting text
          </button>
        </div>
      ) : (
        <div className="field">
          <textarea
            className="input"
            rows={8}
            placeholder="Paste the whole posting here…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button className="btn-link" onClick={() => setPasteMode(false)}>
            back to URL
          </button>
        </div>
      )}

      <div className="row gap">
        <button className="btn btn-primary" disabled={busy} onClick={analyze}>
          {busy ? 'Reading…' : 'Analyze'}
        </button>
        <Link href="/applications/new" className="btn-link">
          no posting? add manually
        </Link>
      </div>
      {busy && <LoadingPanel title="Reading the posting" detail="Extracting role facts, salary signals, keywords, and source." />}
      {tracking && <LoadingPanel title="Creating the workspace" detail="Saving the application locally and opening the materials step." />}
      {error && <p className="form-error" role="alert">{error}</p>}

      {facts && fit && (
        <section className="section motion-in">
          <div className="card">
            <div className="row gap">
              <input className="input" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
              <input className="input" placeholder="Position" value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
            <div className="row gap wrap" style={{ marginTop: 8 }}>
              {ROLE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  className={`chip${roleType === chip.value ? ' chip-selected' : ''}`}
                  onClick={() => setRoleType(chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <FitCard fit={fit} />

          <details className="card">
            <summary className="dim small">posting text ({facts.description.length.toLocaleString()} chars)</summary>
            <pre className="doc">{facts.description}</pre>
          </details>

          <button className="btn btn-primary btn-progress" disabled={tracking} onClick={track}>
            {tracking ? 'Opening workspace…' : 'Track it → materials'}
          </button>
        </section>
      )}
    </div>
  )
}

function FitCard({ fit }: { fit: FitReport }) {
  return (
    <div className="card">
      <div className="row gap">
        <span className="mono" style={{ fontSize: 20 }}>{fit.score}</span>
        <span className="dim small">/100 fit — computed, not vibes</span>
      </div>
      {fit.notes.map((n) => (
        <p key={n} className="small" style={{ margin: '4px 0' }}>{n}</p>
      ))}
      <div className="row gap wrap" style={{ marginTop: 8 }}>
        {fit.matched.map((t) => (
          <span key={t} className="badge kw-matched">{t}</span>
        ))}{' '}
        {fit.missing.map((t) => (
          <span key={t} className="badge kw-missing">{t}</span>
        ))}
      </div>
    </div>
  )
}

function MaterialPanel({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section className="material-panel motion-in">
      <div className="material-panel-head">
        <h2 className="section-title">{title}</h2>
        {kicker && <span className="mono dim small">{kicker}</span>}
      </div>
      {children}
    </section>
  )
}

function QuickEditChips({ onPick }: { onPick: (instruction: string) => void }) {
  const chips = [
    'make the cover letter sharper',
    'lead with design systems',
    'make the resume rewrites more product-design focused',
    'suggest more creative standout moves',
  ]
  return (
    <div className="quick-edit-chips">
      {chips.map((chip) => (
        <button key={chip} className="chip quick-chip" type="button" onClick={() => onPick(chip)}>
          {chip}
        </button>
      ))}
    </div>
  )
}

// ---- Feature 2: cost estimate ----

const ASSUMED_OUTPUT_TOKENS = 1500

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`
  return String(n)
}

function CostEstimate({ promptStr, auth }: { promptStr: string; auth: import('@ghosted/core').AIAuth | null | undefined }) {
  const estimate = useMemo(() => {
    if (!auth) return null
    const inTokens = Math.ceil(promptStr.length / 4)
    const totalTokens = inTokens + ASSUMED_OUTPUT_TOKENS
    const isSubscription = auth.method === 'local_cli' || auth.provider === 'codex'
    const model = modelForAuth(auth)
    const entry = findCatalogEntry(FALLBACK_MODEL_CATALOG, auth.provider, model)
    const costUSD = isSubscription ? null : estimateCostUSD(entry, promptStr.length, ASSUMED_OUTPUT_TOKENS)
    const modelLabel = entry?.label ?? model
    const costStr = costUSD === null ? 'subscription' : `~$${costUSD < 0.01 ? costUSD.toFixed(4) : costUSD.toFixed(2)}`
    return { totalTokens, costStr, modelLabel }
  }, [promptStr, auth])

  if (!estimate) return null

  return (
    <span className="dim small mono cost-estimate">
      {`≈ ${formatTokenCount(estimate.totalTokens)} tokens · ${estimate.costStr} on ${estimate.modelLabel}`}
    </span>
  )
}

// ---- Finale: document cards with download ----

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function FinaleDocCard({
  name,
  content,
  warnings,
  className,
  onCopy,
  copied,
}: {
  name: string
  content: string
  warnings?: React.ReactNode
  className?: string
  onCopy: () => void
  copied: boolean
}) {
  return (
    <div className={`finale-doc-card${className ? ` ${className}` : ''}`}>
      <div className="finale-doc-head">
        <span className="finale-doc-name">{name}</span>
        <div className="finale-doc-actions">
          <button className="btn btn-small" onClick={onCopy}>
            {copied ? 'copied' : 'copy'}
          </button>
          <button className="btn btn-small" onClick={() => downloadBlob(content, name)}>
            download
          </button>
        </div>
      </div>
      {warnings}
      <pre className="doc material-doc">{content}</pre>
    </div>
  )
}

// ---- Finale stage ----

interface ExportAts {
  pass: boolean
  report: string
}

interface ExportResult {
  resume: { pdfBase64: string; ats: ExportAts }
  cover: { pdfBase64: string; ats: ExportAts }
}

function downloadPdf(base64: string, filename: string) {
  const byteChars = atob(base64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ExportResultCard({
  label,
  filename,
  result,
}: {
  label: string
  filename: string
  result: { pdfBase64: string; ats: ExportAts }
}) {
  return (
    <div className="export-result-card">
      <div className="export-result-head">
        <span className="finale-doc-name">{label}</span>
        <button className="btn btn-small" onClick={() => downloadPdf(result.pdfBase64, filename)}>
          Download PDF
        </button>
      </div>
      <p className={`small export-ats-status${result.ats.pass ? ' export-ats-pass' : ' export-ats-fail'}`}>
        {result.ats.pass ? 'ATS check passed' : 'ATS check found problems'}
      </p>
      <details>
        <summary className="dim small" style={{ cursor: 'pointer', marginTop: 4 }}>validator report</summary>
        <pre className="doc mono small export-ats-report">{result.ats.report}</pre>
      </details>
    </div>
  )
}

function Finale({
  app,
  onSwitchToWorkspace,
}: {
  app: Application
  onSwitchToWorkspace: () => void
}) {
  const { updateApplication, transitionTo } = useApps()
  const { baseline } = useBaseline()
  const { auth } = useAIAuth()
  const { model: chosenModel } = useModelChoice()
  const { style, setTemplate, setFont, setAccentColor } = useDocStyle()
  const router = useRouter()

  const posting = app.posting!
  const materials = app.materials!

  const cvJson = baseline?.cv_json ?? ''
  const plan = useMemo(() => planResume(cvJson, posting.matched), [cvJson, posting.matched])

  const letterCheck = checkCoverLetter(materials.cover_letter ?? '')

  const coverLetterContent = materials.cover_letter ?? ''
  const resumeAdjContent = materials.resume_adjustments ?? renderResumeAdjustments(plan, { summary: materials.summary, missing: posting.missing })

  const coverLetterName = buildDownloadName(app.company, 'cover-letter')
  const resumeAdjName = buildDownloadName(app.company, 'resume-adjustments')

  // Generation prompt for revisions — same path as workspace
  const genInput: GenerationInput = useMemo(() => ({
    company: app.company,
    position: app.position,
    descriptionExcerpt: posting.description.slice(0, 6000),
    matched: posting.matched,
    missing: posting.missing,
    cvJson,
    voiceSamples: (baseline?.voice_samples ?? []).map((v) => v.text),
    ...(baseline?.constraints.notes ? { constraintNotes: baseline.constraints.notes } : {}),
  }), [app.company, app.position, posting.description, posting.matched, posting.missing, cvJson, baseline?.voice_samples, baseline?.constraints.notes])

  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [notes, setNotes] = useState(app.notes ?? '')
  const [confirmed, setConfirmed] = useState(false)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [exportedAt, setExportedAt] = useState<string | undefined>(undefined)
  const staleExport = isStaleExport(exportedAt, materials.generated_at)

  // Available fonts from typst
  const [availableFonts, setAvailableFonts] = useState<string[]>([])
  // Fetch font list once on mount (useEffect is already imported)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void fetch('/api/fonts')
      .then((r) => r.json())
      .then((d: { fonts?: string[] }) => {
        if (Array.isArray(d.fonts)) setAvailableFonts(d.fonts)
      })
      .catch(() => undefined)
  }, [])

  const actions = finaleActions(app.status)

  function copy(key: string, text: string) {
    void navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  async function callModel(prompt: string) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auth, prompt, applicationId: app.id, task: 'revision', ...(chosenModel ? { model: chosenModel } : {}) }),
    })
    const data = (await res.json()) as { text?: string; model?: string; error?: string }
    if (!res.ok || !data.text) throw new Error(data.error ?? 'generation failed')
    const parsed = parseGeneration(data.text)
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed
  }

  async function generate(revisionInstruction?: string) {
    setGenError(null)
    setGenerating(true)
    try {
      const revision = revisionInstruction && materials.cover_letter
        ? { current: materials, instruction: revisionInstruction }
        : undefined
      const prompt = buildGenerationPrompt(genInput, revision)
      let result = await callModel(prompt)

      const check = checkCoverLetter(result.cover_letter)
      if (check.overLimit || check.banned.length > 0) {
        const fixes = [
          check.overLimit ? `the letter is ${check.words} words — cut it under ${180}` : '',
          check.banned.length > 0 ? `it uses banned phrasing: ${check.banned.join('; ')} — remove` : '',
        ].filter(Boolean).join('; ')
        result = await callModel(
          buildGenerationPrompt(genInput, { current: result, instruction: `Validator flagged: ${fixes}.` }),
        )
      }

      const updated: Materials = {
        ...materials,
        summary: result.summary,
        cover_letter: result.cover_letter,
        resume_adjustments: renderResumeAdjustments(plan, { summary: result.summary, missing: posting.missing }),
        resume_rewrites: result.resume_rewrites,
        rewrite_decisions: undefined,
        opportunity_angles: result.opportunity_angles,
        standout_suggestions: result.standout_suggestions,
        generated_at: new Date().toISOString(),
        model: auth ? modelForAuth(auth) : undefined,
        revisions: (materials.revisions ?? 0) + (revisionInstruction ? 1 : 0),
      }
      await updateApplication({ ...app, materials: updated })
      setInstruction('')
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function exportPdfs() {
    if (!cvJson) return
    setExportError(null)
    setExporting(true)
    try {
      const payload = buildExportPayload(app, cvJson, plan, style)
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as ExportResult & { error?: string }
      if (!res.ok || !data.resume) throw new Error(data.error ?? 'export failed')
      setExportResult(data)
      const exportedAt = new Date().toISOString()
      setExportedAt(exportedAt)
      // Stamp exported_at onto materials so the detail page can detect staleness.
      if (app.materials) {
        await updateApplication({ ...app, materials: { ...app.materials, exported_at: exportedAt } })
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'export failed')
    } finally {
      setExporting(false)
    }
  }

  async function saveNotes() {
    await updateApplication({ ...app, notes })
  }

  async function finalize() {
    let base = { ...app, needs_materials: undefined }
    if (app.materials) {
      const stamped: Materials = {
        ...app.materials,
        finalized_at: new Date().toISOString(),
        revisions_at_send: app.materials.revisions ?? 0,
      }
      await updateApplication({ ...base, materials: stamped })
      base = { ...base, materials: stamped }
    }
    await transitionTo(base, 'applied')
    setConfirmed(true)
    // Brief confirmation moment (~600ms total), then route to the detail page.
    setTimeout(() => {
      router.push(`/applications/${app.id}`)
    }, 620)
  }

  // Key the animation on generated_at so a regenerate re-staggerers the cards.
  const animKey = materials.generated_at ?? 'initial'

  const fitBadge = posting.fit_score >= 70
    ? <span className="badge kw-matched">{posting.fit_score}/100</span>
    : <span className="badge kw-missing">{posting.fit_score}/100</span>

  if (confirmed) {
    return (
      <div className="apply-flow">
        <ApplyFlowChrome step="materials" company={app.company} position={app.position} status="Applied" />
        <div className="applied-confirm settle" role="status">
          Applied. Opening the application…
        </div>
      </div>
    )
  }

  const resumePdfName = `${app.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company'}-resume.pdf`
  const coverPdfName = `${app.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company'}-cover-letter.pdf`

  return (
    <div className="apply-flow">
      <ApplyFlowChrome
        step="materials"
        company={app.company}
        position={app.position}
        status={generating ? 'Revising' : 'Materials ready'}
      />

      <div className="finale-header reveal">
        <h2 className="finale-title">{app.company} — materials ready</h2>
        {fitBadge}
      </div>

      {generating && (
        <LoadingPanel title="Revising materials" detail="Applying your instruction and refreshing the documents." />
      )}
      {genError && <p className="form-error" role="alert">{genError}</p>}

      <div className="finale-cards" key={animKey}>
        <FinaleDocCard
          name={coverLetterName}
          content={coverLetterContent}
          className="reveal"
          onCopy={() => copy('letter', coverLetterContent)}
          copied={copiedKey === 'letter'}
          warnings={
            (letterCheck.banned.length > 0 || letterCheck.overLimit) ? (
              <div className="row gap wrap" style={{ marginBottom: 8 }}>
                {letterCheck.banned.map((b) => (
                  <span key={b} className="badge kw-missing">banned: {b}</span>
                ))}
                {letterCheck.overLimit && (
                  <span className="badge kw-missing">over {180} words ({letterCheck.words})</span>
                )}
              </div>
            ) : undefined
          }
        />
        <FinaleDocCard
          name={resumeAdjName}
          content={resumeAdjContent}
          className="reveal-2"
          onCopy={() => copy('adj', resumeAdjContent)}
          copied={copiedKey === 'adj'}
        />
      </div>

      {/* Export block */}
      <div className="finale-section export-block reveal-3">
        <h3 className="section-title">Export</h3>
        {!cvJson ? (
          <p className="dim small export-no-cv">PDF export needs a CV — add your CV in onboarding first.</p>
        ) : (
          <>
            {/* Document style row */}
            <div className="doc-style-row row gap" style={{ flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label" style={{ fontSize: 12 }}>Template</label>
                <select
                  className="input"
                  style={{ padding: '4px 8px', fontSize: 13 }}
                  value={style.template}
                  onChange={(e) => setTemplate(e.target.value as 'modern' | 'plain-ats')}
                >
                  <option value="modern">Modern CV — your real template</option>
                  <option value="plain-ats">Plain ATS</option>
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label" style={{ fontSize: 12 }}>Font</label>
                <select
                  className="input"
                  style={{ padding: '4px 8px', fontSize: 13 }}
                  value={style.font ?? ''}
                  onChange={(e) => setFont(e.target.value || undefined)}
                >
                  <option value="">Template default</option>
                  {availableFonts.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              {style.template === 'modern' && (
                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label" style={{ fontSize: 12 }}>Accent</label>
                  <input
                    type="color"
                    style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}
                    value={style.accentColor ?? DEFAULT_ACCENT_COLOR}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </div>
              )}
            </div>
            <p className="dim small" style={{ margin: '0 0 10px', fontSize: 12 }}>
              Every export is still ATS-checked — style never beats extraction.
            </p>

            <div className="row gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-progress"
                disabled={exporting}
                onClick={() => void exportPdfs()}
              >
                {exporting ? 'Rendering…' : 'Export PDFs (Typst)'}
              </button>
              {staleExport && !exporting && (
                <span className="dim small" data-testid="stale-export-hint">
                  letter changed since last export — re-export for fresh PDFs
                </span>
              )}
            </div>
            {exportError && <p className="form-error" role="alert" style={{ marginTop: 8 }}>{exportError}</p>}
            {exportResult && (
              <div className="export-results" data-testid="export-results">
                <ExportResultCard
                  label="resume.pdf"
                  filename={resumePdfName}
                  result={exportResult.resume}
                />
                <ExportResultCard
                  label="cover-letter.pdf"
                  filename={coverPdfName}
                  result={exportResult.cover}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="finale-section reveal-3">
        <h3 className="section-title">Anything to adjust?</h3>
        <QuickEditChips onPick={(chip) => generate(chip)} />
        <div className="row gap revision-row" style={{ marginTop: 8 }}>
          <input
            className="input"
            placeholder='Focused edit — "sharpen the opening", "lead with motion work"…'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && instruction.trim() && generate(instruction.trim())}
          />
          <button className="btn" disabled={generating || !instruction.trim()} onClick={() => generate(instruction.trim())}>
            Revise
          </button>
          <div className="model-picker-inline">
            <ModelPicker />
          </div>
        </div>
      </div>

      <div className="finale-section reveal-4">
        <h3 className="section-title">Notes to self</h3>
        <textarea
          className="input finale-notes"
          placeholder="Anything you want to remember — the hiring manager's name, a question to ask, a concern to address…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveNotes()}
        />
      </div>

      <div className="finale-actions reveal-4">
        {actions.showMarkApplied && (
          <button className="btn btn-primary btn-progress" disabled={generating} onClick={() => void finalize()}>
            Done — mark applied
          </button>
        )}
        {actions.showBackToDetails && (
          <Link href={`/applications/${app.id}`} className="btn">
            Back to details
          </Link>
        )}
        <button className="btn" onClick={onSwitchToWorkspace}>
          Full workspace
        </button>
        {actions.showMarkApplied && (
          <Link href={`/applications/${app.id}`} className="btn-link">
            Details
          </Link>
        )}
      </div>
    </div>
  )
}

// ---- Stage 3: the workspace ----

function Workspace({ app }: { app: Application }) {
  const { updateApplication, transitionTo } = useApps()
  const { baseline } = useBaseline()
  const { auth, connect } = useAIAuth()
  const { model: chosenModel } = useModelChoice()
  const router = useRouter()

  // Default to finale when materials exist, otherwise workspace.
  const [view, setView] = useState<WorkspaceView>(() => defaultView(app))

  // Keep the view state in sync when app data updates (e.g. after generate).
  // If we're in workspace and materials just arrived, stay in workspace so the
  // user sees the result — let them switch to finale manually or via the
  // generate() success path below.

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const posting = app.posting!
  const cvJson = baseline?.cv_json ?? ''

  // Deterministic resume plan — exists before any model call.
  const plan = useMemo(() => planResume(cvJson, posting.matched), [cvJson, posting.matched])
  const adjustments = useMemo(
    () => renderResumeAdjustments(plan, { ...(app.materials?.summary ? { summary: app.materials.summary } : {}), missing: posting.missing }),
    [plan, app.materials?.summary, posting.missing],
  )

  const letterCheck = app.materials?.cover_letter ? checkCoverLetter(app.materials.cover_letter) : null

  const genInput: GenerationInput = useMemo(() => ({
    company: app.company,
    position: app.position,
    descriptionExcerpt: posting.description.slice(0, 6000),
    matched: posting.matched,
    missing: posting.missing,
    cvJson,
    voiceSamples: (baseline?.voice_samples ?? []).map((v) => v.text),
    ...(baseline?.constraints.notes ? { constraintNotes: baseline.constraints.notes } : {}),
  }), [app.company, app.position, posting.description, posting.matched, posting.missing, cvJson, baseline?.voice_samples, baseline?.constraints.notes])

  // Honesty report — deterministic, computed from the draft materials and the CV.
  const honestyReport: HonestyReport = useMemo(() => checkDraftHonesty(
    {
      resume_rewrites: app.materials?.resume_rewrites ?? [],
      opportunity_angles: app.materials?.opportunity_angles ?? [],
      standout_suggestions: app.materials?.standout_suggestions ?? [],
    },
    cvJson,
  ), [app.materials?.resume_rewrites, app.materials?.opportunity_angles, app.materials?.standout_suggestions, cvJson])

  // Build the prompt string in a useMemo — reused for cost estimate and the actual call.
  const promptStr = useMemo(() => {
    const revision = instruction.trim() && app.materials?.cover_letter
      ? { current: app.materials, instruction: instruction.trim() }
      : undefined
    return buildGenerationPrompt(genInput, revision)
  }, [genInput, instruction, app.materials])

  async function callModel(prompt: string) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ auth, prompt, applicationId: app.id, task: app.materials?.cover_letter ? 'revision' : 'cover_letter', ...(chosenModel ? { model: chosenModel } : {}) }),
    })
    const data = (await res.json()) as { text?: string; model?: string; error?: string }
    if (!res.ok || !data.text) throw new Error(data.error ?? 'generation failed')
    const parsed = parseGeneration(data.text)
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed
  }

  async function generate(revisionInstruction?: string) {
    setGenError(null)
    setGenerating(true)
    try {
      const revision =
        revisionInstruction && app.materials?.cover_letter
          ? { current: app.materials, instruction: revisionInstruction }
          : undefined
      const prompt = buildGenerationPrompt(genInput, revision)
      let result = await callModel(prompt)

      // Deterministic validation; one automatic correction round, then we
      // show warnings rather than looping.
      const check = checkCoverLetter(result.cover_letter)
      if (check.overLimit || check.banned.length > 0) {
        const fixes = [
          check.overLimit ? `the letter is ${check.words} words — cut it under ${180}` : '',
          check.banned.length > 0 ? `it uses banned phrasing: ${check.banned.join('; ')} — remove` : '',
        ]
          .filter(Boolean)
          .join('; ')
        result = await callModel(
          buildGenerationPrompt(genInput, { current: result, instruction: `Validator flagged: ${fixes}.` }),
        )
      }

      const materials: Materials = {
        ...app.materials,
        summary: result.summary,
        cover_letter: result.cover_letter,
        resume_adjustments: renderResumeAdjustments(plan, { summary: result.summary, missing: posting.missing }),
        resume_rewrites: result.resume_rewrites,
        // Clear stale decisions when rewrites are replaced.
        rewrite_decisions: undefined,
        opportunity_angles: result.opportunity_angles,
        standout_suggestions: result.standout_suggestions,
        generated_at: new Date().toISOString(),
        model: auth ? modelForAuth(auth) : undefined,
        revisions: (app.materials?.revisions ?? 0) + (revisionInstruction ? 1 : 0),
      }
      await updateApplication({ ...app, materials })
      setInstruction('')
      // Advance to finale on successful generation.
      setView('finale')
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const handleDecide = useCallback(
    async (index: number, decision: RewriteDecision | null) => {
      const current = app.materials?.rewrite_decisions ?? {}
      let next: Record<number, RewriteDecision> | undefined
      if (decision === null) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [index]: _, ...rest } = current as Record<number, RewriteDecision>
        next = Object.keys(rest).length > 0 ? rest : undefined
      } else {
        next = { ...current, [index]: decision }
      }
      await updateApplication({ ...app, materials: { ...app.materials, rewrite_decisions: next } })
    },
    [app, updateApplication],
  )

  const handleCopyAccepted = useCallback(async () => {
    const rewrites = app.materials?.resume_rewrites ?? []
    const decisions = app.materials?.rewrite_decisions ?? {}
    const lines = rewrites
      .map((r, i) => {
        const d = decisions[i]
        if (d?.status !== 'accepted') return null
        return `• ${d.edited ?? r.rewrite}`
      })
      .filter(Boolean)
      .join('\n')
    if (lines) {
      await navigator.clipboard.writeText(lines)
      setCopied('accepted-rewrites')
      setTimeout(() => setCopied(null), 1500)
    }
  }, [app.materials?.resume_rewrites, app.materials?.rewrite_decisions])

  // The Finale view is rendered inside Workspace so both share the same
  // app reference (which updates after generate()).
  if (view === 'finale' && app.materials?.cover_letter) {
    return <Finale app={app} onSwitchToWorkspace={() => setView('workspace')} />
  }

  return (
    <div className="apply-flow">
      <ApplyFlowChrome
        step="materials"
        company={app.company}
        position={app.position}
        status={generating ? 'Writing materials' : app.materials?.cover_letter ? 'Draft ready' : 'Materials needed'}
      />

      <div className="row spread wrap apply-actions motion-in">
        <div className="row gap">
          <Link href={`/applications/${app.id}`} className="btn">
            Details
          </Link>
          {app.materials?.cover_letter && (
            <button className="btn" onClick={() => setView('finale')}>
              Finale
            </button>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={async () => {
            let base = { ...app, needs_materials: undefined }
            if (app.materials) {
              const stamped = {
                ...app.materials,
                finalized_at: new Date().toISOString(),
                revisions_at_send: app.materials.revisions ?? 0,
              }
              await updateApplication({ ...base, materials: stamped })
              base = { ...base, materials: stamped }
            }
            await transitionTo(base, 'applied')
            router.push('/')
          }}
        >
          Materials done — applying
        </button>
      </div>

      <div className="card motion-in">
        <span className="mono">{posting.fit_score}/100</span>
        <span className="dim small"> · </span>
        {posting.matched.map((t) => (
          <span key={t} className="badge kw-matched">{t}</span>
        ))}{' '}
        {posting.missing.map((t) => (
          <span key={t} className="badge kw-missing">{t}</span>
        ))}
      </div>

      <div className="materials-dashboard">
        <aside className="workspace-context motion-in">
          <MaterialPanel title="Posting context" kicker={`${posting.description.length.toLocaleString()} chars`}>
            <pre className="doc context-doc">{posting.description}</pre>
          </MaterialPanel>
        </aside>

        <main className="materials-main">
          {generating && <LoadingPanel title="Writing editable materials" detail="Drafting cover letter, resume rewrites, opportunity angles, and standout moves from your existing evidence." />}
          {!auth ? (
            <div className="card">
              <p className="dim small">Connect your AI to draft editable materials. Tracking still works without it.</p>
              <ConnectAI onConnect={connect} />
            </div>
          ) : (
            <>
              <div className="editor-toolbar motion-in">
                <div>
                  <h2 className="section-title">Editing mode</h2>
                  <p className="dim small">Start from AI suggestions, then ask for focused changes. You should not be writing from scratch.</p>
                </div>
                <div className="row gap" style={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
                  <CostEstimate promptStr={promptStr} auth={auth} />
                  <div className="model-picker-inline">
                    <ModelPicker />
                  </div>
                  <button className="btn btn-primary" disabled={generating} onClick={() => generate()}>
                    {generating ? 'Writing…' : app.materials?.cover_letter ? 'Regenerate all' : 'Generate materials'}
                  </button>
                </div>
              </div>

              {app.materials?.cover_letter && (
                <>
                  <QuickEditChips onPick={(chip) => generate(chip)} />
                  <div className="row gap revision-row">
                    <input
                      className="input"
                      placeholder={'Focused edit — "make the standout ideas more visual", "tighten resume rewrites"…'}
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && instruction.trim() && generate(instruction.trim())}
                    />
                    <button className="btn" disabled={generating || !instruction.trim()} onClick={() => generate(instruction.trim())}>
                      Revise
                    </button>
                  </div>
                </>
              )}
              {genError && <p className="form-error" role="alert">{genError}</p>}
              {app.materials?.cover_letter && honestyReport.flagged > 0 && (
                <p className="dim small" data-testid="honesty-summary">
                  {honestyReport.flagged} {honestyReport.flagged === 1 ? 'item needs' : 'items need'} your judgment — the model could not ground {honestyReport.flagged === 1 ? 'it' : 'them'} in your CV.
                </p>
              )}

              <div className="materials-grid">
                <MaterialPanel title="Cover letter" kicker={app.materials?.cover_letter ? `${letterCheck?.words ?? 0} words` : 'not generated'}>
                  {app.materials?.cover_letter ? (
                    <>
                      <pre className="doc material-doc">{app.materials.cover_letter}</pre>
                      <div className="row gap wrap panel-actions">
                        {app.materials.model && <span className="mono dim small">model: {app.materials.model}</span>}
                        {letterCheck?.banned.map((b) => <span key={b} className="badge kw-missing">banned: {b}</span>)}
                        {letterCheck?.overLimit && <span className="badge kw-missing">over {180} words</span>}
                        <button className="btn btn-small" onClick={() => copy('letter', app.materials!.cover_letter!)}>{copied === 'letter' ? 'copied' : 'copy'}</button>
                      </div>
                    </>
                  ) : <p className="dim small">Generate to draft a short letter from the CV and posting.</p>}
                </MaterialPanel>

                <MaterialPanel title="Resume rewrites" kicker="AI rewording">
                  <RewritesPanel
                    rewrites={app.materials?.resume_rewrites}
                    decisions={app.materials?.rewrite_decisions}
                    onDecide={handleDecide}
                    onCopyAccepted={handleCopyAccepted}
                    fallback={<pre className="doc material-doc">{adjustments}</pre>}
                    checks={honestyReport.rewrites}
                  />
                  {!app.materials?.resume_rewrites?.length && (
                    <button className="btn btn-small" onClick={() => copy('adjustments', adjustments)}>{copied === 'adjustments' ? 'copied' : 'copy computed plan'}</button>
                  )}
                </MaterialPanel>

                <MaterialPanel title="Opportunity angles" kicker="where to lean in">
                  {app.materials?.opportunity_angles?.length ? app.materials.opportunity_angles.map((angle, i) => {
                    const angleCheck = honestyReport.angles[i]
                    return (
                      <div className="suggestion-card" key={`${angle.title}-${i}`}>
                        <h3>{angle.title}</h3>
                        <p>{angle.evidence}</p>
                        {angleCheck && !angleCheck.evidenceFound && (
                          <span className="badge dim small" data-testid="badge-evidence-not-found">evidence not found in CV</span>
                        )}
                        <p className="dim small">Use: {angle.use}</p>
                      </div>
                    )
                  }) : <p className="dim small">Generate to see which parts of your background are most worth emphasizing.</p>}
                </MaterialPanel>

                <MaterialPanel title="Standout moves" kicker="beyond docs">
                  <StandoutsPanel
                    standouts={app.materials?.standout_suggestions}
                    spammyIndexes={honestyReport.spammyStandouts}
                  />
                </MaterialPanel>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
