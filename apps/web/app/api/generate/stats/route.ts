import { NextResponse } from 'next/server'
import { readGenerationRuns, readGenerationStats } from '../../../../lib/server/generationTelemetry'

export async function GET() {
  const [runs, summary] = await Promise.all([readGenerationRuns(), readGenerationStats()])
  return NextResponse.json({ summary, recent: runs.slice(-20).reverse() })
}
