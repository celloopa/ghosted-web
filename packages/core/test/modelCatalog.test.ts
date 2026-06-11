import { describe, it, expect } from 'vitest'
import {
  calculateUsageCost,
  estimateCostUSD,
  estimateTextGenerationCost,
  FALLBACK_MODEL_CATALOG,
  findCatalogEntry,
  mergeModelCatalog,
  normalizeOpenRouterModel,
  summarizeGenerationRuns,
  type GenerationRunRecord,
} from '../src/index'

describe('model catalog pricing', () => {
  it('calculates Pi-shaped cost buckets', () => {
    const cost = calculateUsageCost(
      { input: 1000, output: 200, cacheRead: 500, cacheWrite: 100 },
      { input: 0.000001, output: 0.00001, cacheRead: 0.0000001, cacheWrite: 0.00000125, source: 'manual' },
    )
    expect(cost.input).toBeCloseTo(0.001)
    expect(cost.output).toBeCloseTo(0.002)
    expect(cost.cacheRead).toBeCloseTo(0.00005)
    expect(cost.cacheWrite).toBeCloseTo(0.000125)
    expect(cost.total).toBeCloseTo(0.003175)
  })

  it('estimates prompt/output cost from chars when provider usage is unavailable', () => {
    const model = findCatalogEntry(FALLBACK_MODEL_CATALOG, 'codex', 'gpt-5-mini')!
    const est = estimateTextGenerationCost(model, 4000, 800)
    expect(est.usage.input).toBe(1000)
    expect(est.usage.output).toBe(200)
    expect(est.cost.total).toBeGreaterThan(0)
  })
})

describe('OpenRouter normalization', () => {
  it('turns OpenRouter pricing into provider catalog entries', () => {
    const entry = normalizeOpenRouterModel({
      id: 'anthropic/claude-haiku-4.5',
      name: 'Claude Haiku 4.5',
      context_length: 200000,
      pricing: { prompt: '0.000001', completion: '0.000005', input_cache_read: '0.0000001' },
      top_provider: { max_completion_tokens: 64000 },
    })
    expect(entry).toMatchObject({ provider: 'anthropic', label: 'Claude Haiku 4.5', contextWindow: 200000 })
    expect(entry?.pricing?.source).toBe('openrouter')
  })

  it('merges refreshed models over fallbacks by provider+id', () => {
    const refreshed = normalizeOpenRouterModel({
      id: 'openai/gpt-5-mini',
      name: 'GPT-5 mini refreshed',
      pricing: { prompt: '0.0000002', completion: '0.000002' },
    })!
    const merged = mergeModelCatalog(FALLBACK_MODEL_CATALOG, [refreshed])
    expect(findCatalogEntry(merged, 'openai', 'gpt-5-mini')?.label).toBe('GPT-5 mini refreshed')
    expect(findCatalogEntry(merged, 'codex', 'gpt-5-mini')?.label).toMatch(/Codex/)
  })
})

describe('estimateCostUSD', () => {
  it('returns null for codex provider (subscription billing)', () => {
    const entry = findCatalogEntry(FALLBACK_MODEL_CATALOG, 'codex', 'gpt-5-mini')!
    expect(estimateCostUSD(entry, 4000)).toBeNull()
  })

  it('returns a positive number for an API-billed anthropic model', () => {
    const entry = findCatalogEntry(FALLBACK_MODEL_CATALOG, 'anthropic', 'claude-sonnet-4-6')!
    const cost = estimateCostUSD(entry, 4000, 1500)
    expect(cost).not.toBeNull()
    expect(cost!).toBeGreaterThan(0)
  })

  it('uses ceil(promptChars / 4) for input tokens', () => {
    // 4001 chars → ceil(4001/4) = 1001 input tokens; 1500 output tokens assumed
    // haiku: $1/Mtok input = 0.000001/tok; $5/Mtok output = 0.000005/tok
    const entry = findCatalogEntry(FALLBACK_MODEL_CATALOG, 'anthropic', 'claude-haiku-4-5')!
    const cost = estimateCostUSD(entry, 4001, 1500)!
    // 1001 * 0.000001 + 1500 * 0.000005 = 0.001001 + 0.0075 = 0.008501
    expect(cost).toBeCloseTo(0.001001 + 0.0075, 5)
  })

  it('returns null when entry is undefined', () => {
    expect(estimateCostUSD(undefined, 1000)).toBeNull()
  })

  it('scales linearly with prompt size', () => {
    const entry = findCatalogEntry(FALLBACK_MODEL_CATALOG, 'openai', 'gpt-5-mini')!
    const small = estimateCostUSD(entry, 4000, 1500)!
    const large = estimateCostUSD(entry, 8000, 1500)!
    // input tokens double; output stays same; so large - small ≈ 1000 more input tokens
    expect(large).toBeGreaterThan(small)
    const inPricePerToken = entry.pricing!.input
    expect(large - small).toBeCloseTo(1000 * inPricePerToken, 8)
  })
})

describe('generation run summaries', () => {
  it('aggregates cost and later quality ratings per model', () => {
    const base: GenerationRunRecord = {
      id: 'run-1',
      at: '2026-06-11T00:00:00.000Z',
      task: 'cover_letter',
      provider: 'openai',
      model: 'gpt-5-mini',
      method: 'api_key',
      durationMs: 1000,
      promptChars: 100,
      responseChars: 40,
      usage: { input: 25, output: 10 },
      cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, internalReasoning: 0, request: 0, total: 0.03 },
      costEstimated: false,
      ok: true,
      qualityRating: 4,
    }
    const summary = summarizeGenerationRuns([base, { ...base, id: 'run-2', qualityRating: 2 }])
    expect(summary.runs).toBe(2)
    expect(summary.totalCost).toBeCloseTo(0.06)
    expect(summary.byModel[0]?.averageRating).toBe(3)
  })
})
