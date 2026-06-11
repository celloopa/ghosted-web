'use client'

import { computeStats, type GroupStats } from '@ghosted/core'
import { useApps } from '../../lib/useApps'
import { strings } from '../../lib/strings'

// The stats screen IS computeStats — this page renders its output verbatim
// (M4 contract: same function, no reimplementation). Every chart completes
// "so I should…"; no jokes here, the data is the deadpan.
export default function Stats() {
  const { apps } = useApps()
  if (apps === null) return null

  const stats = computeStats(apps)
  const anyData = stats.byRoleType.some((g) => g.total > 0)

  return (
    <div>
      <h1 className="page-title">Stats</h1>
      {!anyData ? (
        <div className="card empty-state">
          <p>{strings.lowData}</p>
        </div>
      ) : (
        <>
          <Dimension title="By role type" groups={stats.byRoleType} noun="role type" />
          <Dimension title="By source" groups={stats.bySource} noun="source" />
          <Dimension title="By resume version" groups={stats.byResumeVersion} noun="resume" />
        </>
      )}
    </div>
  )
}

function Dimension({ title, groups, noun }: { title: string; groups: GroupStats[]; noun: string }) {
  const visible = groups.filter((g) => g.total > 0)
  if (visible.length === 0) return null

  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <p className="takeaway">{takeaway(visible, noun)}</p>
      <div className="stat-grid">
        {visible.map((g) => (
          <StatBlock key={g.key} group={g} />
        ))}
      </div>
    </section>
  )
}

function StatBlock({ group: g }: { group: GroupStats }) {
  return (
    <div className={`card stat-block${g.lowData ? ' stat-low' : ''}`}>
      <div className="stat-key">{g.key.replace(/_/g, ' ')}</div>
      {g.lowData ? (
        // Honest with small n: counts, never confident percentages.
        <div className="stat-counts mono">
          {g.responses} of {g.total} replied
          {g.interviews > 0 && <> · {g.interviews} interviewed</>}
        </div>
      ) : (
        <>
          <Rate label="response" value={g.responseRate} />
          <Rate label="interview" value={g.interviewRate} />
        </>
      )}
      <div className="dim small mono">
        n={g.total}
        {g.medianDaysToFirstResponse !== null && <> · ~{g.medianDaysToFirstResponse}d to reply</>}
      </div>
    </div>
  )
}

function Rate({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null
  const pct = Math.round(value * 100)
  return (
    <div className="rate">
      <span className="rate-label dim small">{label}</span>
      <div className="rate-bar">
        <div className="rate-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="mono">{pct}%</span>
    </div>
  )
}

// Plain-language takeaway: principle 4 — every stat completes "so I should…".
function takeaway(groups: GroupStats[], noun: string): string {
  const rated = groups.filter((g) => !g.lowData && g.responseRate !== null)
  if (rated.length === 0) return strings.lowData
  const sorted = [...rated].sort((a, b) => (b.responseRate ?? 0) - (a.responseRate ?? 0))
  const best = sorted[0]!
  const worst = sorted[sorted.length - 1]!
  const bestName = best.key.replace(/_/g, ' ')
  if (rated.length === 1 || best.key === worst.key) {
    return `${bestName} gets a ${Math.round((best.responseRate ?? 0) * 100)}% response rate so far. Keep feeding the chart.`
  }
  if ((worst.responseRate ?? 0) === 0) {
    return `${worst.key.replace(/_/g, ' ')} hasn't produced a single reply. Aim at ${bestName}.`
  }
  const ratio = (best.responseRate ?? 0) / (worst.responseRate ?? 1)
  return `${bestName} replies ${ratio >= 1.5 ? `${ratio.toFixed(1)}× as often as` : 'about as often as'} ${worst.key.replace(/_/g, ' ')}. ${ratio >= 1.5 ? 'Aim there.' : `No clear winner by ${noun} yet.`}`
}
