import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  approxTokensForText,
  calculateUsageCost,
  FALLBACK_MODEL_CATALOG,
  findCatalogEntry,
  summarizeGenerationRuns,
  type AIAuth,
  type GenerationRunRecord,
  type UsageParts,
} from '@ghosted/core'

const DATA_DIR = join(process.cwd(), '.ghosted-local')
const RUNS_PATH = join(DATA_DIR, 'generation-runs.jsonl')

function n(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function usageFromProvider(raw: unknown, prompt: string, text: string): { usage: UsageParts; estimated: boolean } {
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>
    // Anthropic Messages API.
    const anthropicInput = n(r.input_tokens)
    const anthropicOutput = n(r.output_tokens)
    if (anthropicInput !== undefined || anthropicOutput !== undefined) {
      return {
        usage: {
          input: anthropicInput ?? approxTokensForText(prompt),
          output: anthropicOutput ?? approxTokensForText(text),
          cacheRead: n(r.cache_read_input_tokens),
          cacheWrite: n(r.cache_creation_input_tokens),
        },
        estimated: false,
      }
    }

    // OpenAI Responses API.
    const openAIInput = n(r.input_tokens)
    const openAIOutput = n(r.output_tokens)
    if (openAIInput !== undefined || openAIOutput !== undefined) {
      const inputDetails = typeof r.input_tokens_details === 'object' && r.input_tokens_details !== null ? (r.input_tokens_details as Record<string, unknown>) : {}
      const outputDetails = typeof r.output_tokens_details === 'object' && r.output_tokens_details !== null ? (r.output_tokens_details as Record<string, unknown>) : {}
      return {
        usage: {
          input: openAIInput ?? approxTokensForText(prompt),
          output: openAIOutput ?? approxTokensForText(text),
          cacheRead: n(inputDetails.cached_tokens),
          internalReasoning: n(outputDetails.reasoning_tokens),
        },
        estimated: false,
      }
    }
  }

  return { usage: { input: approxTokensForText(prompt), output: approxTokensForText(text) }, estimated: true }
}

export async function recordGenerationRun(args: {
  auth: AIAuth
  model: string
  prompt: string
  text: string
  rawUsage: unknown
  started: number
  ok: boolean
  error?: string
  applicationId?: string
  task?: GenerationRunRecord['task']
}): Promise<GenerationRunRecord> {
  const parsedUsage = usageFromProvider(args.rawUsage, args.prompt, args.text)
  const entry = findCatalogEntry(FALLBACK_MODEL_CATALOG, args.auth.provider, args.model)
  const record: GenerationRunRecord = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}`,
    at: new Date().toISOString(),
    task: args.task ?? 'cover_letter',
    provider: args.auth.provider,
    model: args.model,
    method: args.auth.method,
    durationMs: Date.now() - args.started,
    promptChars: args.prompt.length,
    responseChars: args.text.length,
    usage: parsedUsage.usage,
    cost: calculateUsageCost(parsedUsage.usage, entry?.pricing),
    costEstimated: parsedUsage.estimated || !entry?.pricing,
    ok: args.ok,
    ...(args.error ? { error: args.error } : {}),
    ...(args.applicationId ? { applicationId: args.applicationId } : {}),
  }
  await mkdir(DATA_DIR, { recursive: true })
  await appendFile(RUNS_PATH, `${JSON.stringify(record)}\n`, 'utf8')
  return record
}

export async function readGenerationRuns(): Promise<GenerationRunRecord[]> {
  try {
    const raw = await readFile(RUNS_PATH, 'utf8')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as GenerationRunRecord)
  } catch {
    return []
  }
}

export async function readGenerationStats() {
  return summarizeGenerationRuns(await readGenerationRuns())
}
