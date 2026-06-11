'use client'

import { useState } from 'react'
import { parseV1Import } from '@ghosted/core'
import { useApps } from '../../lib/useApps'
import { strings } from '../../lib/strings'

// Import/export keeps the local-first escape hatch. parseV1Import accepts
// v1 (Go ghosted) and ghosted2 CLI JSON: `ghosted2 list --json` pipes in.
export default function Settings() {
  const { apps, importApps, replaceAll } = useApps()
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

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
