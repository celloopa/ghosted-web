import { isGhosted, needsFollowUp, GHOST_THRESHOLD_DAYS, type Application } from '@ghosted/core'

// Placeholder page: proves the monorepo wiring (web → tested core) and the
// token system. Real screens start with M3 — see docs/M3_CHECKLIST.md.
const sample: Application = {
  id: 'demo',
  company: 'Somewhere Great',
  position: 'Design Engineer',
  role_type: 'design_engineer',
  status: 'applied',
  date_applied: '2026-05-20',
  events: [{ type: 'applied', date: '2026-05-20' }],
}

export default function Home() {
  const today = new Date().toISOString().slice(0, 10)
  const ghosted = isGhosted(sample, today)
  const followUp = needsFollowUp(sample, today)

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Ghosted</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Silence, measured.</p>

      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-card)',
          padding: 16,
          marginTop: 32,
        }}
      >
        <div style={{ fontWeight: 500 }}>{sample.company}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{sample.position}</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, fontFamily: 'var(--font-data)', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>{sample.status}</span>
          {ghosted && (
            <span
              style={{
                color: 'var(--state-ghost)',
                background: 'var(--state-ghost-bg)',
                borderRadius: 'var(--radius-badge)',
                padding: '2px 6px',
              }}
              title={`No response in ${GHOST_THRESHOLD_DAYS} days. Officially a ghost. It's them, not you.`}
            >
              👻 ghosted
            </span>
          )}
          {followUp && (
            <span
              style={{
                color: 'var(--state-followup)',
                background: 'var(--state-followup-bg)',
                borderRadius: 'var(--radius-badge)',
                padding: '2px 6px',
              }}
            >
              ⏰ follow up
            </span>
          )}
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 32 }}>
        The badges above are computed by <code>@ghosted/core</code> — 44 tests, zero bookkeeping.
        Screens arrive with M3.
      </p>
    </main>
  )
}
