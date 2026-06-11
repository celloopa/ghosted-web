'use client'

import { useEffect, useState } from 'react'
import { computeStats, rewriteAcceptance, type GroupStats, type Materials } from '@ghosted/core'
import { useApps } from '../../lib/useApps'
import { strings } from '../../lib/strings'
import type { RunStats } from '../../lib/server/runStats'

// The stats screen IS computeStats — this page renders its output verbatim
// (M4 contract: same function, no reimplementation). Every chart completes
// "so I should…"; no jokes here, the data is the deadpan.
export default function Stats() {
  const { apps } = useApps()
  const [runStats, setRunStats] = useState<RunStats | null>(null)

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((d: RunStats) => setRunStats(d))
      .catch(() => setRunStats({ models: [] }))
  }, [])

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
      <GenerationSection apps={apps} runStats={runStats} />
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

// ---- Generation section ----

interface AppWithMaterials {
  materials?: Materials
}

interface PerModelClientStat {
  model: string
  finalizedDrafts: number
  avgRevisionsAtSend: number | null
  overallAcceptancePct: number | null
}

function deriveClientStats(apps: AppWithMaterials[]): PerModelClientStat[] {
  const byModel = new Map<string, { finalized: number; totalRevisions: number; acc: number; rej: number }>()
  for (const app of apps) {
    const m = app.materials
    if (!m?.model || !m.finalized_at) continue
    const cur = byModel.get(m.model) ?? { finalized: 0, totalRevisions: 0, acc: 0, rej: 0 }
    cur.finalized += 1
    cur.totalRevisions += m.revisions_at_send ?? 0
    const ra = rewriteAcceptance(m)
    cur.acc += ra.accepted
    cur.rej += ra.rejected
    byModel.set(m.model, cur)
  }
  return [...byModel.entries()].map(([model, s]) => ({
    model,
    finalizedDrafts: s.finalized,
    avgRevisionsAtSend: s.finalized > 0 ? Math.round((s.totalRevisions / s.finalized) * 10) / 10 : null,
    overallAcceptancePct: s.acc + s.rej > 0 ? Math.round((s.acc / (s.acc + s.rej)) * 100) : null,
  }))
}

function genTakeaway(model: string, runs: number, okRuns: number, avgRevisions: number | null): string {
  if (runs < 3) return `${runs} run${runs !== 1 ? 's' : ''} recorded — too few to trend.`
  const successPct = Math.round((okRuns / runs) * 100)
  if (avgRevisions !== null && avgRevisions <= 1) {
    return `${model} gets drafts out the door in ~${avgRevisions} revision.`
  }
  if (avgRevisions !== null) {
    return `${model} succeeds ${successPct}% of the time and takes ~${avgRevisions} revisions per draft.`
  }
  return `${model} succeeds ${successPct}% of runs.`
}

function GenerationSection({
  apps,
  runStats,
}: {
  apps: AppWithMaterials[]
  runStats: RunStats | null
}) {
  const clientStats = deriveClientStats(apps)

  const allModels = new Set<string>([
    ...(runStats?.models.map((m) => m.model) ?? []),
    ...clientStats.map((s) => s.model),
  ])

  if (allModels.size === 0 && (runStats === null || runStats.models.length === 0)) {
    return (
      <section className="section">
        <h2 className="section-title">Generation</h2>
        <p className="dim small">No generations yet.</p>
      </section>
    )
  }

  const cards = [...allModels].map((model) => {
    const server = runStats?.models.find((m) => m.model === model)
    const client = clientStats.find((s) => s.model === model)
    const runs = server?.runs ?? 0
    const okRuns = server?.okRuns ?? 0
    const totalCostUSD = server?.totalCostUSD ?? 0
    const avgMs = server?.avgMs ?? 0
    const finalizedDrafts = client?.finalizedDrafts ?? 0
    const avgRevisions = client?.avgRevisionsAtSend ?? null
    const acceptancePct = client?.overallAcceptancePct ?? null
    const lowData = runs < 3

    return { model, runs, okRuns, totalCostUSD, avgMs, finalizedDrafts, avgRevisions, acceptancePct, lowData }
  })

  return (
    <section className="section">
      <h2 className="section-title">Generation</h2>
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.model} className={`card stat-block${c.lowData ? ' stat-low' : ''}`}>
            <div className="stat-key mono">{c.model}</div>
            {c.lowData ? (
              <div className="stat-counts mono">
                {c.runs} run{c.runs !== 1 ? 's' : ''}{c.okRuns > 0 && ` · ${c.okRuns} ok`}
              </div>
            ) : (
              <>
                <div className="rate">
                  <span className="rate-label dim small">success</span>
                  <div className="rate-bar">
                    <div className="rate-fill" style={{ width: `${Math.round((c.okRuns / c.runs) * 100)}%` }} />
                  </div>
                  <span className="mono">{Math.round((c.okRuns / c.runs) * 100)}%</span>
                </div>
              </>
            )}
            <div className="dim small mono" style={{ marginTop: 6, display: 'grid', gap: 2 }}>
              {c.runs > 0 && <span>n={c.runs} · ~${c.totalCostUSD.toFixed(3)} total</span>}
              {!c.lowData && c.avgMs > 0 && <span>~{Math.round(c.avgMs / 1000)}s avg</span>}
              {c.finalizedDrafts > 0 && <span>{c.finalizedDrafts} draft{c.finalizedDrafts !== 1 ? 's' : ''} sent</span>}
              {c.avgRevisions !== null && !c.lowData && <span>~{c.avgRevisions} rev to send</span>}
              {c.acceptancePct !== null && !c.lowData && <span>{c.acceptancePct}% rewrites accepted</span>}
            </div>
            {!c.lowData && (
              <p className="dim small" style={{ marginTop: 8 }}>
                {genTakeaway(c.model, c.runs, c.okRuns, c.avgRevisions)}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
