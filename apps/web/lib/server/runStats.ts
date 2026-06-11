// Pure aggregator for generation-runs.jsonl records.
// No I/O — takes parsed line objects; the route handles reading.

export interface RunModelStat {
  model: string
  runs: number
  okRuns: number
  totalCostUSD: number
  avgMs: number
}

export interface RunStats {
  models: RunModelStat[]
}

type AnyRecord = Record<string, unknown>

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function costFromRecord(rec: AnyRecord): number {
  // Prefer the nested cost.total field; fall back to top-level estimatedCostUSD.
  const cost = rec.cost
  if (typeof cost === 'object' && cost !== null) {
    const total = (cost as AnyRecord).total
    if (typeof total === 'number' && Number.isFinite(total)) return total
  }
  const est = rec.estimatedCostUSD ?? rec.estimated_cost_usd
  return num(est)
}

export function aggregateRunStats(lines: unknown[]): RunStats {
  const byModel = new Map<string, { runs: number; okRuns: number; totalCostUSD: number; totalMs: number }>()

  for (const raw of lines) {
    if (typeof raw !== 'object' || raw === null) continue
    const rec = raw as AnyRecord
    const model = typeof rec.model === 'string' && rec.model.length > 0 ? rec.model : 'unknown'
    const ok = rec.ok === true
    const durationMs = num(rec.durationMs)
    const costUSD = costFromRecord(rec)

    const cur = byModel.get(model) ?? { runs: 0, okRuns: 0, totalCostUSD: 0, totalMs: 0 }
    cur.runs += 1
    if (ok) {
      cur.okRuns += 1
      cur.totalCostUSD += costUSD
      cur.totalMs += durationMs
    }
    byModel.set(model, cur)
  }

  const models: RunModelStat[] = [...byModel.entries()].map(([model, s]) => ({
    model,
    runs: s.runs,
    okRuns: s.okRuns,
    totalCostUSD: s.totalCostUSD,
    avgMs: s.okRuns > 0 ? Math.round(s.totalMs / s.okRuns) : 0,
  }))

  return { models }
}

/** Parse a raw jsonl string — malformed lines are silently skipped. */
export function parseJsonlLines(raw: string): unknown[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}
