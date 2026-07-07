import { NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { FALLBACK_MODEL_CATALOG, mergeModelCatalog, normalizeOpenRouterModel, type ModelCatalogEntry } from '@ghosted/core'
import { isHouseConfigured } from '../../../lib/server/houseConnection'

const MODEL_REVALIDATE_SECONDS = 43200
export const revalidate = 43200

/** Check whether a CLI binary is reachable by resolving it through PATH + known extra dirs. */
function probeCli(envBin: string | undefined, fallbackName: string): Promise<boolean> {
  const bin = envBin ?? fallbackName
  // If it's an absolute path we can probe it directly; otherwise we resolve via `which`.
  const [cmd, args] =
    bin.startsWith('/') || bin.startsWith('~')
      ? ['test', ['-x', bin.replace(/^~/, homedir())]]
      : ['which', [bin]]
  const extraPaths = [`${homedir()}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'].join(':')
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        timeout: 4000,
        env: { ...process.env, PATH: `${process.env.PATH ?? ''}:${extraPaths}` },
      },
      (err) => resolve(!err),
    )
  }).catch(() => false) as Promise<boolean>
}

export async function GET() {
  // Server CLIs belong to the house account — they are not a BYOK offer. When
  // a house account is configured, never advertise claude_cli/codex_cli as
  // available to visitors (and skip the probe subprocess spawns entirely).
  const houseGated = isHouseConfigured()

  const [refreshed, claudeCli, codexCli] = await Promise.all([
    fetchOpenRouterCatalog().catch((): ModelCatalogEntry[] => []),
    houseGated ? Promise.resolve(false) : probeCli(process.env.GHOSTED_CLAUDE_BIN, 'claude'),
    houseGated ? Promise.resolve(false) : probeCli(process.env.GHOSTED_CODEX_BIN, 'codex'),
  ])
  return NextResponse.json({
    models: mergeModelCatalog(FALLBACK_MODEL_CATALOG, refreshed),
    refreshed: refreshed.length,
    sources: ['fallback', ...(refreshed.length > 0 ? ['openrouter'] : [])],
    available: { claude_cli: claudeCli, codex_cli: codexCli },
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
