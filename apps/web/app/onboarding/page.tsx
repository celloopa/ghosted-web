'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  validateCVJson,
  baselineStatus,
  type Baseline,
  type CVSummary,
  type RemotePreference,
  type RoleType,
} from '@ghosted/core'
import { useBaseline } from '../../lib/useBaseline'
import { useAIAuth } from '../../lib/useAIAuth'
import { ConnectAI } from '../../components/ConnectAI'
import { describeAIAuth } from '@ghosted/core'

// Baseline kit onboarding: one-time, ~10 minutes, draft-saved at every
// step. The agent only ever writes from what's collected here — this flow
// is where "never invent" gets its facts.

const STEPS = ['CV', 'Voice', 'Links', 'Targeting', 'Connect', 'Review'] as const

const ROLE_CHIPS: { value: RoleType; label: string }[] = [
  { value: 'design_engineer', label: 'Design Engineer' },
  { value: 'product_designer', label: 'Product Designer' },
  { value: 'brand_motion', label: 'Brand / Motion' },
  { value: 'other', label: 'Other' },
]

const REMOTE_CHIPS: { value: RemotePreference; label: string }[] = [
  { value: 'remote_only', label: 'Remote only' },
  { value: 'hybrid_ok', label: 'Hybrid OK' },
  { value: 'onsite_ok', label: 'On-site OK' },
]

export default function Onboarding() {
  const { baseline, save } = useBaseline()
  const { auth, connect } = useAIAuth()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Baseline | null>(null)

  useEffect(() => {
    if (baseline && !draft) setDraft(baseline)
  }, [baseline, draft])

  if (!draft) return null

  const cv = draft.cv_json ? validateCVJson(draft.cv_json) : null
  const cvSummary: CVSummary | null = cv?.ok ? cv.summary : null

  async function next() {
    await save(draft!) // draft-saved at every step — refresh-safe
    // Arriving at Links with none set: prefill from the CV's profiles.
    if (step === 1 && draft!.links.length === 0 && cvSummary && cvSummary.profiles.length > 0) {
      setDraft({ ...draft!, links: cvSummary.profiles })
    }
    setStep(step + 1)
  }

  async function finish() {
    await save(draft!)
    router.push('/')
  }

  return (
    <div className="narrow">
      <h1 className="page-title">Baseline</h1>
      <p className="dim">
        The agent only ever writes from your facts. This is where the facts come from.
      </p>

      <div className="steps" role="list" aria-label="onboarding progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            role="listitem"
            className={`step-dot${i === step ? ' step-current' : ''}${i < step ? ' step-done' : ''}`}
            onClick={() => i < step && setStep(i)}
          >
            {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <section className="section">
          <h2 className="section-title">Your CV</h2>
          <p className="dim small">
            JSON Resume format. Paste it, or pick the file (e.g.{' '}
            <span className="mono">local/cv.json</span> from the ghosted repo).
          </p>
          <input
            type="file"
            accept="application/json,.json"
            aria-label="CV file"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setDraft({ ...draft, cv_json: await f.text() })
            }}
          />
          <textarea
            className="input mono cv-paste"
            rows={8}
            placeholder='{"basics":{"name":"…"},"work":[…],"skills":[…]}'
            value={draft.cv_json ?? ''}
            onChange={(e) => setDraft({ ...draft, cv_json: e.target.value })}
          />
          {draft.cv_json && cv && !cv.ok && (
            <p className="form-error" role="alert">
              {cv.errors[0]?.message}
            </p>
          )}
          {cvSummary && (
            <div className="card cv-summary">
              <span className="success">✓ {cvSummary.name}</span>
              <span className="dim mono small">
                {' '}
                · {cvSummary.workCount} roles · {cvSummary.skillCount} skills
                {cvSummary.profiles.length > 0 && <> · {cvSummary.profiles.length} profiles found</>}
              </span>
            </div>
          )}
          <div className="row gap section">
            <button className="btn btn-primary" disabled={!cvSummary} onClick={next}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="section">
          <h2 className="section-title">Voice</h2>
          <p className="dim small">
            Paste one or two past cover letters you’d actually send again. The agent calibrates
            register from these — skip it and you get correct-but-generic.
          </p>
          {[0, 1].map((i) => (
            <textarea
              key={i}
              className="input"
              rows={5}
              placeholder={i === 0 ? 'A cover letter that worked…' : 'Another one (optional)…'}
              value={draft.voice_samples[i]?.text ?? ''}
              onChange={(e) => {
                const samples = [...draft.voice_samples]
                if (e.target.value.trim() === '') samples.splice(i, 1)
                else samples[i] = { text: e.target.value }
                setDraft({ ...draft, voice_samples: samples.filter(Boolean) })
              }}
            />
          ))}
          <StepNav onBack={() => setStep(0)} onNext={next} skippable={draft.voice_samples.length === 0} />
        </section>
      )}

      {step === 2 && (
        <section className="section">
          <h2 className="section-title">Links</h2>
          <p className="dim small">Portfolio, GitHub, LinkedIn, Bluesky — what a letter may cite.</p>
          {[...draft.links, { label: '', url: '' }].map((link, i) => (
            <div className="row gap" key={i}>
              <input
                className="input link-label"
                placeholder="Label"
                value={link.label}
                onChange={(e) => setDraft({ ...draft, links: editLink(draft.links, i, { ...link, label: e.target.value }) })}
              />
              <input
                className="input"
                placeholder="https://…"
                value={link.url}
                onChange={(e) => setDraft({ ...draft, links: editLink(draft.links, i, { ...link, url: e.target.value }) })}
              />
            </div>
          ))}
          <StepNav onBack={() => setStep(1)} onNext={next} skippable={draft.links.length === 0} />
        </section>
      )}

      {step === 3 && (
        <section className="section">
          <h2 className="section-title">Targeting</h2>
          <div className="field">
            <span className="field-label">Role types you’re applying for (powers the fit gate + stats)</span>
            <div className="row gap wrap">
              {ROLE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  className={`chip${draft.constraints.role_types_in.includes(chip.value) ? ' chip-selected' : ''}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      constraints: { ...draft.constraints, role_types_in: toggle(draft.constraints.role_types_in, chip.value) },
                    })
                  }
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Remote</span>
            <div className="row gap wrap">
              {REMOTE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  className={`chip${draft.constraints.remote === chip.value ? ' chip-selected' : ''}`}
                  onClick={() => setDraft({ ...draft, constraints: { ...draft.constraints, remote: chip.value } })}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field-label">Location</span>
            <input
              className="input"
              placeholder="Portland, OR"
              value={draft.constraints.location ?? ''}
              onChange={(e) => setDraft({ ...draft, constraints: { ...draft.constraints, location: e.target.value } })}
            />
          </label>
          <label className="field">
            <span className="field-label">Salary floor (yearly, optional)</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="120000"
              value={draft.constraints.salary_floor ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  constraints: { ...draft.constraints, salary_floor: e.target.value ? Number(e.target.value) : undefined },
                })
              }
            />
          </label>
          <label className="field">
            <span className="field-label">Anything the agent must know (visa, notice period, dealbreakers)</span>
            <textarea
              className="input"
              rows={3}
              value={draft.constraints.notes ?? ''}
              onChange={(e) => setDraft({ ...draft, constraints: { ...draft.constraints, notes: e.target.value } })}
            />
          </label>
          <StepNav onBack={() => setStep(2)} onNext={next} nextDisabled={draft.constraints.role_types_in.length === 0} />
        </section>
      )}

      {step === 4 && (
        <section className="section">
          <h2 className="section-title">Connect your AI</h2>
          <p className="dim small">
            The apply flow drafts cover letters, resume adjustments, and answers with your own AI account.
            Use your Claude subscription if you have one — an API key works too.
          </p>
          {auth ? (
            <div className="card">
              <p className="success">✓ {describeAIAuth(auth)}</p>
              <div className="row gap">
                <button className="btn btn-primary" onClick={() => setStep(5)}>
                  Continue
                </button>
                <button className="btn" onClick={() => setStep(3)}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <ConnectAI
                onConnect={async (a) => {
                  await connect(a)
                  setStep(5)
                }}
              />
              <div className="row gap section">
                <button className="btn" onClick={() => setStep(3)}>
                  Back
                </button>
                <button className="btn" onClick={() => setStep(5)}>
                  Skip for now
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 5 && (
        <section className="section">
          <h2 className="section-title">What the agent will know</h2>
          <div className="card facts">
            <Recap label="facts" value={cvSummary ? `${cvSummary.name} — ${cvSummary.workCount} roles, ${cvSummary.skillCount} skills` : 'no CV'} />
            <Recap label="voice" value={draft.voice_samples.length > 0 ? `${draft.voice_samples.length} sample${draft.voice_samples.length > 1 ? 's' : ''}` : 'none — letters will be correct but generic'} />
            <Recap label="links" value={draft.links.length > 0 ? draft.links.map((l) => l.label).join(', ') : 'none'} />
            <Recap label="targeting" value={draft.constraints.role_types_in.map((r) => r.replace('_', ' ')).join(', ') || 'none'} />
            {draft.constraints.salary_floor && <Recap label="floor" value={`$${draft.constraints.salary_floor.toLocaleString()}`} />}
            {draft.constraints.notes && <Recap label="must know" value={draft.constraints.notes} />}
            <Recap label="pdf template" value="ats-job-docs (single column, ATS-validated)" />
            <Recap label="ai" value={auth ? describeAIAuth(auth) : 'not connected — tracking works, document drafting stays off'} />
          </div>
          <p className="dim small">
            And nothing beyond it: no invented roles, dates, metrics, or tools — ever.
          </p>
          <div className="row gap">
            <button className="btn" onClick={() => setStep(4)}>
              Back
            </button>
            <button className="btn btn-primary" disabled={!baselineStatus(draft).ready} onClick={finish}>
              Baseline ready
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function StepNav({
  onBack,
  onNext,
  skippable = false,
  nextDisabled = false,
}: {
  onBack: () => void
  onNext: () => void
  skippable?: boolean
  nextDisabled?: boolean
}) {
  return (
    <div className="row gap section">
      <button className="btn" onClick={onBack}>
        Back
      </button>
      <button className="btn btn-primary" disabled={nextDisabled} onClick={onNext}>
        {skippable ? 'Skip for now' : 'Continue'}
      </button>
    </div>
  )
}

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function editLink(links: { label: string; url: string }[], i: number, next: { label: string; url: string }) {
  const out = [...links]
  out[i] = next
  return out.filter((l) => l.label.trim() !== '' || l.url.trim() !== '')
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
