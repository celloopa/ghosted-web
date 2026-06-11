import { NextResponse } from 'next/server'
import { FALLBACK_MODEL_CATALOG, mergeModelCatalog, normalizeOpenRouterModel } from '@ghosted/core'

const MODEL_REVALIDATE_SECONDS = 43200
export const revalidate = 43200

export async function GET() {
  const refreshed = await fetchOpenRouterCatalog().catch(() => [])
  return NextResponse.json({
    models: mergeModelCatalog(FALLBACK_MODEL_CATALOG, refreshed),
    refreshed: refreshed.length,
    sources: ['fallback', ...(refreshed.length > 0 ? ['openrouter'] : [])],
  })
}

async function fetchOpenRouterCatalog() {
  const res = await fetch('https://openrouter.ai/api/v1/models?output_modalities=text&sort=newest', {
    headers: { accept: 'application/json' },
    next: { revalidate: MODEL_REVALIDATE_SECONDS },
  })
  if (!res.ok) throw new Error(`OpenRouter models API answered ${res.status}`)
  const data = (await res.json()) as { data?: unknown[] }
  const now = new Date().toISOString()
  return (data.data ?? [])
    .map((m) => normalizeOpenRouterModel(m as Parameters<typeof normalizeOpenRouterModel>[0], now))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
}
