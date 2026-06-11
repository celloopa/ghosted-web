'use client'

import Link from 'next/link'
import { useState } from 'react'
import { describeAIAuth, parseV1Import, validateCVJson } from '@ghosted/core'
import { useApps } from '../../lib/useApps'
import { useBaseline } from '../../lib/useBaseline'
import { useAIAuth } from '../../lib/useAIAuth'
import { ConnectAI } from '../../components/ConnectAI'
import { strings } from '../../lib/strings'

// Import/export keeps the local-first escape hatch. parseV1Import accepts
// v1 (Go ghosted) and ghosted2 CLI JSON: `ghosted2 list --json` pipes in.
export default function Settings() {
  const { apps, importApps, replaceAll } = useApps()
  const { baseline, status, clear: clearBaseline } = useBaseline()
  const { auth, connect, disconnect } = useAIAuth()
  const [showConnect, setShowConnect] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const cvName =
    baseline?.cv_json && validateCVJson(baseline.cv_json).ok
      ? (validateCVJson(baseline.cv_json) as { ok: true; summary: { name: string } }).summary.name
      : null

  async function handleFile(file: File) {
    setMessage(null)
    setErrors([])
    const text = await file.text()
    const result = parseV1Import(text)
    if (!result.ok) {
      setErrors(result.errors.map((e) => `${e.path}: ${e.message}`))
      return
    }
    await importApps(result.applications)
    setMessage(strings.importSuccess(result.applications.length))
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(apps ?? [], null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ghosted-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="narrow">
      <h1 className="page-title">Settings</h1>

      <section className="section">
        <h2 className="section-title">Baseline</h2>
        {status?.ready ? (
          <p className="small">
            <span className="success">✓ ready</span>
            {cvName && <span className="dim"> — CV: {cvName}</span>}
            {status.recommended.length > 0 && (
              <span className="dim"> · recommended: {status.recommended.join(', ')}</span>
            )}
          </p>
        ) : (
          <p className="small dim">Not set up yet{status && status.missing.length > 0 && <> — missing: {status.missing.join(', ')}</>}.</p>
        )}
        <div className="row gap">
          <Link href="/onboarding" className="btn">
            {status?.ready ? 'Edit baseline' : 'Set up baseline'}
          </Link>
          {status?.ready && (
            <button
              className="btn-link danger"
              onClick={async () => {
                if (confirm('Clear the baseline? The agent loses its facts until you redo this.')) {
                  await clearBaseline()
                }
              }}
            >
              Clear
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">AI connection</h2>
        {auth && !showConnect ? (
          <>
            <p className="small">
              <span className="success">✓ {describeAIAuth(auth)}</span>
            </p>
            <div className="row gap">
              <button className="btn" onClick={() => setShowConnect(true)}>
                Change
              </button>
              <button
                className="btn-link danger"
                onClick={async () => {
                  if (confirm('Disconnect? Document drafting turns off until you reconnect.')) {
                    await disconnect()
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            {!auth && <p className="small dim">Not connected — tracking works, document drafting stays off.</p>}
            <ConnectAI
              current={auth ?? undefined}
              onConnect={async (a) => {
                await connect(a)
                setShowConnect(false)
              }}
            />
          </>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Import</h2>
        <p className="dim small">
          Accepts v1 <span className="mono">applications.json</span> and{' '}
          <span className="mono">ghosted2 list --json</span> output. Merges by id — nothing is overwritten silently.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
        {message && <p className="success">{message}</p>}
        {errors.length > 0 && (
          <div className="form-error">
            <p>Import failed:</p>
            <ul>
              {errors.slice(0, 5).map((e) => (
                <li key={e} className="mono small">{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Export</h2>
        <button className="btn" onClick={exportJSON} disabled={!apps || apps.length === 0}>
          Download JSON ({apps?.length ?? 0} applications)
        </button>
      </section>

      <section className="section">
        <h2 className="section-title">Data</h2>
        <p className="dim small">
          Stored locally in this browser for now. Accounts + sync arrive with M2 (Supabase) — the storage layer is
          already built for the swap.
        </p>
        <button
          className="btn-link danger"
          onClick={async () => {
            if (confirm('Delete all local data? Export first if you care about it.')) {
              await replaceAll([])
              setMessage('All local data deleted.')
            }
          }}
        >
          Delete all local data
        </button>
      </section>
    </div>
  )
}
