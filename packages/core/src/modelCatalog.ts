import type { AIModelClass, AIProvider } from './aiauth'

export type PricingSource = 'official' | 'openrouter' | 'manual' | 'estimated'

export interface ModelPricing {
  /** USD per token, matching OpenRouter's pricing unit and Pi's cost math inputs. */
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  request?: number
  internalReasoning?: number
  source: PricingSource
  updatedAt?: string
}

export interface ModelCatalogEntry {
  id: string
  provider: AIProvider
  label: string
  modelClass: AIModelClass
  detail?: string
  contextWindow?: number
  maxOutput?: number
  pricing?: ModelPricing
  source: PricingSource
  updatedAt?: string
}

export interface UsageParts {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  internalReasoning?: number
}

export interface UsageCost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  internalReasoning: number
  request: number
  total: number
}

export interface GenerationRunRecord {
  id: string
  at: string
  task: 'cover_letter' | 'revision' | 'unknown'
  provider: AIProvider
  model: string
  method: string
  durationMs: number
  promptChars: number
  responseChars: number
  usage: UsageParts
  cost: UsageCost
  costEstimated: boolean
  ok: boolean
  error?: string
  applicationId?: string
  qualityRating?: 1 | 2 | 3 | 4 | 5
}

const mtok = (usdPerMillion: number) => usdPerMillion / 1_000_000

export const FALLBACK_MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    modelClass: 'small',
    contextWindow: 200_000,
    maxOutput: 64_000,
    pricing: { input: mtok(1), output: mtok(5), source: 'official' },
    source: 'official',
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    label: 'Claude Sonnet 4.6',
    modelClass: 'standard',
    contextWindow: 1_000_000,
    maxOutput: 64_000,
    pricing: { input: mtok(3), output: mtok(15), source: 'official' },
    source: 'official',
  },
  {
    id: 'claude-opus-4-8',
    provider: 'anthropic',
    label: 'Claude Opus 4.8',
    modelClass: 'deep',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { input: mtok(5), output: mtok(25), source: 'official' },
    source: 'official',
  },
  {
    id: 'gpt-5-mini',
    provider: 'openai',
    label: 'GPT-5 mini',
    modelClass: 'small',
    pricing: { input: mtok(0.25), output: mtok(2), cacheRead: mtok(0.03), source: 'manual' },
    source: 'manual',
  },
  {
    id: 'gpt-5.4-mini',
    provider: 'openai',
    label: 'GPT-5.4 mini',
    modelClass: 'small',
    pricing: { input: mtok(0.75), output: mtok(4.5), cacheRead: mtok(0.075), source: 'official' },
    source: 'official',
  },
  {
    id: 'gpt-5.5',
    provider: 'openai',
    label: 'GPT-5.5',
    modelClass: 'deep',
    pricing: { input: mtok(5), output: mtok(30), cacheRead: mtok(0.5), source: 'official' },
    source: 'official',
  },
  {
    id: 'gpt-5-mini',
    provider: 'codex',
    label: 'Codex with GPT-5 mini',
    modelClass: 'small',
    pricing: { input: mtok(0.25), output: mtok(2), cacheRead: mtok(0.03), source: 'estimated' },
    source: 'estimated',
  },
  {
    id: 'gpt-5.5',
    provider: 'codex',
    label: 'Codex with GPT-5.5',
    modelClass: 'standard',
    pricing: { input: mtok(5), output: mtok(30), cacheRead: mtok(0.5), source: 'estimated' },
    source: 'estimated',
  },
]

export function approxTokensForText(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export function calculateUsageCost(usage: UsageParts, pricing?: ModelPricing): UsageCost {
  const p = pricing ?? { input: 0, output: 0, source: 'estimated' as const }
  const input = usage.input * p.input
  const output = usage.output * p.output
  const cacheRead = (usage.cacheRead ?? 0) * (p.cacheRead ?? 0)
  const cacheWrite = (usage.cacheWrite ?? 0) * (p.cacheWrite ?? p.input)
  const internalReasoning = (usage.internalReasoning ?? 0) * (p.internalReasoning ?? p.output)
  const request = p.request ?? 0
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    internalReasoning,
    request,
    total: input + output + cacheRead + cacheWrite + internalReasoning + request,
  }
}

export function estimateTextGenerationCost(entry: ModelCatalogEntry, promptChars: number, expectedOutputChars: number): { usage: UsageParts; cost: UsageCost } {
  const usage = { input: approxTokensForText('x'.repeat(Math.max(0, promptChars))), output: approxTokensForText('x'.repeat(Math.max(0, expectedOutputChars))) }
  return { usage, cost: calculateUsageCost(usage, entry.pricing) }
}

export interface OpenRouterModelLike {
  id?: unknown
  name?: unknown
  context_length?: unknown
  pricing?: Record<string, unknown>
  top_provider?: Record<string, unknown> | null
}

function numString(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

function providerFromOpenRouterId(id: string): AIProvider | null {
  if (id.startsWith('anthropic/')) return 'anthropic'
  if (id.startsWith('openai/')) return 'openai'
  return null
}

function classFromName(id: string, name: string): AIModelClass {
  const text = `${id} ${name}`.toLowerCase()
  if (/opus|fable|gpt-5\.5|pro|large/.test(text)) return 'deep'
  if (/haiku|mini|nano|small/.test(text)) return 'small'
  return 'standard'
}

function providerModelId(openRouterId: string): string {
  return openRouterId.replace(/^anthropic\//, '').replace(/^openai\//, '')
}

export function normalizeOpenRouterModel(model: OpenRouterModelLike, now = new Date().toISOString()): ModelCatalogEntry | null {
  if (typeof model.id !== 'string') return null
  const provider = providerFromOpenRouterId(model.id)
  if (!provider) return null
  const pricing = model.pricing ?? {}
  const prompt = numString(pricing.prompt)
  const completion = numString(pricing.completion)
  if (prompt === undefined || completion === undefined) return null
  const name = typeof model.name === 'string' && model.name ? model.name : providerModelId(model.id)
  const top = model.top_provider ?? null
  const maxOutput = top ? numString(top.max_completion_tokens) : undefined
  return {
    id: providerModelId(model.id),
    provider,
    label: name,
    modelClass: classFromName(model.id, name),
    contextWindow: numString(model.context_length),
    ...(maxOutput !== undefined ? { maxOutput } : {}),
    pricing: {
      input: prompt,
      output: completion,
      cacheRead: numString(pricing.input_cache_read),
      cacheWrite: numString(pricing.input_cache_write),
      request: numString(pricing.request),
      internalReasoning: numString(pricing.internal_reasoning),
      source: 'openrouter',
      updatedAt: now,
    },
    source: 'openrouter',
    updatedAt: now,
  }
}

export function mergeModelCatalog(base: ModelCatalogEntry[], incoming: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const map = new Map<string, ModelCatalogEntry>()
  for (const entry of base) map.set(`${entry.provider}:${entry.id}`, entry)
  for (const entry of incoming) map.set(`${entry.provider}:${entry.id}`, { ...map.get(`${entry.provider}:${entry.id}`), ...entry })
  return [...map.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.modelClass.localeCompare(b.modelClass) || a.label.localeCompare(b.label))
}

export function catalogForProvider(catalog: ModelCatalogEntry[], provider: AIProvider): ModelCatalogEntry[] {
  return catalog.filter((m) => m.provider === provider)
}

export function findCatalogEntry(catalog: ModelCatalogEntry[], provider: AIProvider, model: string): ModelCatalogEntry | undefined {
  return catalog.find((m) => m.provider === provider && m.id === model)
}

export interface GenerationStatsSummary {
  runs: number
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  byModel: { provider: AIProvider; model: string; runs: number; totalCost: number; averageCost: number; averageRating: number | null }[]
}

export function summarizeGenerationRuns(records: GenerationRunRecord[]): GenerationStatsSummary {
  const by = new Map<string, { provider: AIProvider; model: string; runs: number; totalCost: number; ratings: number[] }>()
  let totalCost = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  for (const r of records.filter((run) => run.ok)) {
    totalCost += r.cost.total
    totalInputTokens += r.usage.input
    totalOutputTokens += r.usage.output
    const key = `${r.provider}:${r.model}`
    const cur = by.get(key) ?? { provider: r.provider, model: r.model, runs: 0, totalCost: 0, ratings: [] }
    cur.runs += 1
    cur.totalCost += r.cost.total
    if (r.qualityRating) cur.ratings.push(r.qualityRating)
    by.set(key, cur)
  }
  return {
    runs: records.filter((r) => r.ok).length,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    byModel: [...by.values()].map((m) => ({
      provider: m.provider,
      model: m.model,
      runs: m.runs,
      totalCost: m.totalCost,
      averageCost: m.runs > 0 ? m.totalCost / m.runs : 0,
      averageRating: m.ratings.length > 0 ? m.ratings.reduce((s, r) => s + r, 0) / m.ratings.length : null,
    })),
  }
}
