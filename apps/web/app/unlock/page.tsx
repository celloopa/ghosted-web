'use client'

/**
 * Invite gate unlock page.
 *
 * Shown to any visitor who doesn't yet have the 'ghosted_invite' cookie.
 * One input, one button. No branding overload — calm and direct.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UnlockPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'That code did not match.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="narrow">
      <h1 className="page-title">Ghosted</h1>
      <p className="dim" style={{ marginBottom: 24 }}>
        Ghosted is invite-only while it&apos;s being tested.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Invite code</span>
          <input
            className="input"
            type="text"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter your invite code"
            disabled={busy}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
