import { describe, it, expect } from 'vitest'
import { aggregateRunStats, parseJsonlLines } from '../lib/server/runStats'

const makeRun = (model: string, ok: boolean, costTotal: number, durationMs: number) => ({
  model,
  ok,
  durationMs,
  cost: { total: costTotal, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, internalReasoning: 0, request: 0 },
})

describe('aggregateRunStats', () => {
  it('returns empty models for empty input', () => {
    expect(aggregateRunStats([])).toEqual({ models: [] })
  })

  it('skips malformed / non-object entries', () => {
    const result = aggregateRunStats([null, 'bad', 42, undefined, { model: 'gpt-5', ok: true, durationMs: 1000, cost: { total: 0.01 } }])
    expect(result.models).toHaveLength(1)
    expect(result.models[0]!.model).toBe('gpt-5')
  })

  it('aggregates runs, okRuns, cost, and avgMs per model correctly', () => {
    const runs = [
      makeRun('claude-sonnet', true, 0.03, 4000),
      makeRun('claude-sonnet', true, 0.05, 6000),
      makeRun('claude-sonnet', false, 0, 1000),
      makeRun('gpt-5.5', true, 0.07, 44000),
    ]
    const result = aggregateRunStats(runs)
    const sonnet = result.models.find((m) => m.model === 'claude-sonnet')!
    const gpt = result.models.find((m) => m.model === 'gpt-5.5')!

    expect(sonnet.runs).toBe(3)
    expect(sonnet.okRuns).toBe(2)
    expect(sonnet.totalCostUSD).toBeCloseTo(0.08)
    expect(sonnet.avgMs).toBe(5000) // (4000+6000)/2

    expect(gpt.runs).toBe(1)
    expect(gpt.okRuns).toBe(1)
    expect(gpt.totalCostUSD).toBeCloseTo(0.07)
    expect(gpt.avgMs).toBe(44000)
  })

  it('handles missing cost fields gracefully — treats as 0', () => {
    const run = { model: 'gpt-5-mini', ok: true, durationMs: 2000 }
    const result = aggregateRunStats([run])
    expect(result.models[0]!.totalCostUSD).toBe(0)
    expect(result.models[0]!.avgMs).toBe(2000)
  })
})

describe('parseJsonlLines', () => {
  it('returns empty array for empty string', () => {
    expect(parseJsonlLines('')).toEqual([])
  })

  it('skips malformed lines and returns valid ones', () => {
    const raw = '{"model":"a","ok":true}\nNOT_JSON\n{"model":"b","ok":false}'
    const result = parseJsonlLines(raw)
    expect(result).toHaveLength(2)
  })

  it('parses real jsonl fixture matching actual file format', () => {
    const raw = [
      '{"id":"abc","at":"2026-06-11T20:44:05.442Z","task":"cover_letter","provider":"codex","model":"gpt-5.5","method":"local_cli","durationMs":43507,"promptChars":22056,"responseChars":5233,"usage":{"input":5514,"output":1309},"cost":{"input":0.02757,"output":0.03927,"cacheRead":0,"cacheWrite":0,"internalReasoning":0,"request":0,"total":0.06684},"costEstimated":true,"ok":true}',
      '{"id":"def","at":"2026-06-11T22:29:47.491Z","task":"cover_letter","provider":"anthropic","model":"claude-sonnet-4-6","method":"local_cli","durationMs":4131,"promptChars":9405,"responseChars":0,"usage":{"input":2352,"output":0},"cost":{"input":0.007056,"output":0,"cacheRead":0,"cacheWrite":0,"internalReasoning":0,"request":0,"total":0.007056},"costEstimated":true,"ok":false}',
    ].join('\n')
    const lines = parseJsonlLines(raw)
    expect(lines).toHaveLength(2)
    const stats = aggregateRunStats(lines)
    const gpt = stats.models.find((m) => m.model === 'gpt-5.5')!
    const sonnet = stats.models.find((m) => m.model === 'claude-sonnet-4-6')!
    expect(gpt.okRuns).toBe(1)
    expect(gpt.totalCostUSD).toBeCloseTo(0.06684)
    expect(sonnet.okRuns).toBe(0) // failed run
    expect(sonnet.runs).toBe(1)
  })
})
