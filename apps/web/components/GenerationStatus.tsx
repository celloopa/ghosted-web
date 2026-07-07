'use client'

import { useEffect, useRef, useState } from 'react'

export interface GenerationStatusProps {
  /** True while the one bounded model call is in flight. */
  active: boolean
  /** Human label for the model doing the writing, e.g. "Codex with GPT-5.5". */
  modelLabel?: string
  /** What kind of call this is — purely for the data-kind hook, no branching copy. */
  kind?: 'generate' | 'revise' | 'answer'
}

// The generation flow is: deterministic prompt build (instant) → ONE long
// model call (10–90s, cannot stream) → deterministic validation (instant).
// This component only ever reports what is actually true about those phases
// — no fake percentages, no progress bar pretending to know something it
// doesn't.

const ASSEMBLING_MS = 1200
const SETTLE_MS = 800

function subLine(elapsedS: number): string {
  if (elapsedS < 15) return 'one bounded call. the code already did the deterministic work.'
  if (elapsedS < 40) return 'still writing. letters take longer than chips suggest.'
  if (elapsedS < 75) return 'long one. the model returns everything at once — no partials to show.'
  return 'unusually long. if it errors, the message will say why.'
}

type Phase = 'idle' | 'running' | 'settling'

export function GenerationStatus({ active, modelLabel, kind }: GenerationStatusProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const startRef = useRef<number | null>(null)
  const wasActiveRef = useRef(false)

  // Detect active flips and drive the phase machine.
  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = active

    if (active && !wasActive) {
      // false -> true: a call just started. Start the clock.
      startRef.current = Date.now()
      setElapsedMs(0)
      setPhase('running')
      return
    }

    if (!active && wasActive) {
      // true -> false: the call just returned. Validation is deterministic
      // and instant, but we say so out loud for a beat before disappearing.
      startRef.current = null
      setPhase('settling')
      const t = setTimeout(() => setPhase('idle'), SETTLE_MS)
      return () => clearTimeout(t)
    }

    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Tick the elapsed timer once a second while running.
  useEffect(() => {
    if (phase !== 'running') return undefined
    const id = setInterval(() => {
      if (startRef.current !== null) setElapsedMs(Date.now() - startRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  if (phase === 'idle') return null

  if (phase === 'settling') {
    return (
      <div className="generation-status" role="status" aria-live="polite">
        <span className="generation-status-spinner action-spinner" aria-hidden />
        <span className="generation-status-line">checking the draft — word cap, banned phrases, honesty flags</span>
      </div>
    )
  }

  const elapsedS = Math.floor(elapsedMs / 1000)
  const assembling = elapsedMs < ASSEMBLING_MS

  return (
    <div className="generation-status" data-kind={kind} role="status" aria-live="polite">
      <span className="generation-status-spinner action-spinner" aria-hidden />
      {assembling ? (
        <span className="generation-status-line">assembling the prompt — cv, posting, fit</span>
      ) : (
        <div className="generation-status-lines">
          <span className="generation-status-line">
            writing with {modelLabel ?? 'the model'} — <span className="mono generation-status-timer">{elapsedS}s</span>
          </span>
          <span className="dim small generation-status-sub">{subLine(elapsedS)}</span>
        </div>
      )}
    </div>
  )
}
