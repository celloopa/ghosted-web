'use client'

import { useRef, useState, useEffect, type ReactNode } from 'react'

export type ActionButtonProps = {
  /** The async action. THROW (reject) to signal failure. Return value is ignored. */
  onAct: () => Promise<unknown>
  /** Label shown when idle, e.g. "Revise letter" or "Export PDFs". */
  idleLabel: ReactNode
  /** Label shown while running, e.g. "Revising…", "Generating…", "Rendering…". */
  runningLabel: string
  /** Label shown during the brief success flash. Default: "Done ✓". */
  doneLabel?: string
  /** Passed straight to the <button> className, e.g. "btn btn-primary". */
  className?: string
  /** External disable (e.g. empty input). Combined with the internal running state. */
  disabled?: boolean
  title?: string
  'aria-label'?: string
  'data-testid'?: string
  /** Optional: also bubble the error message to the parent (in addition to inline display). */
  onError?: (message: string) => void
  /** How long the success flash lasts before returning to idle. Default 1200. */
  successMs?: number
}

type Phase = 'idle' | 'running' | 'done' | 'error'

export function ActionButton({
  onAct,
  idleLabel,
  runningLabel,
  doneLabel = 'Done ✓',
  className,
  disabled,
  title,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
  onError,
  successMs = 1200,
}: ActionButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const runningRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the success timer on unmount to avoid setState after unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  async function handleClick() {
    // Bulletproof double-fire guard — does NOT depend on a React re-render.
    if (runningRef.current) return
    runningRef.current = true

    setPhase('running')
    setErrorMessage('')

    try {
      await onAct()
      setPhase('done')
      timerRef.current = setTimeout(() => {
        setPhase('idle')
        timerRef.current = null
      }, successMs)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'something went wrong'
      setErrorMessage(msg)
      setPhase('error')
      onError?.(msg)
    } finally {
      runningRef.current = false
    }
  }

  const isDisabled = disabled || phase === 'running'

  // Determine what to render inside the button and what the accessible name is.
  let buttonContent: ReactNode
  if (phase === 'running') {
    buttonContent = (
      <>
        <span className="action-spinner" aria-hidden />
        {runningLabel}
      </>
    )
  } else if (phase === 'done') {
    buttonContent = doneLabel
  } else {
    // idle or error — show idleLabel
    buttonContent = idleLabel
  }

  return (
    <span className="action-btn">
      <button
        className={className}
        disabled={isDisabled}
        onClick={handleClick}
        title={title}
        aria-label={ariaLabel}
        data-testid={dataTestId}
      >
        {buttonContent}
      </button>
      {phase === 'error' && errorMessage && (
        <span className="action-error" role="alert">
          {errorMessage}
        </span>
      )}
    </span>
  )
}
