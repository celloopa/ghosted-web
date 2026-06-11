import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { aggregateRunStats, parseJsonlLines } from '../../../lib/server/runStats'

const RUNS_PATH = join(process.cwd(), '.ghosted-local', 'generation-runs.jsonl')

export async function GET() {
  let raw = ''
  try {
    raw = await readFile(RUNS_PATH, 'utf8')
  } catch {
    // File absent on first run — return empty stats.
    return NextResponse.json({ models: [] })
  }

  const lines = parseJsonlLines(raw)
  const stats = aggregateRunStats(lines)
  return NextResponse.json(stats)
}
