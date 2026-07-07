import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { FALLBACK_MODEL_CATALOG, findCatalogEntry, modelForAuth, type AIAuth, type GenerationRunRecord } from '@ghosted/core'
import { recordGenerationRun } from '../../../lib/server/generationTelemetry'
import { resolveRunner } from '../../../lib/server/resolveRunner'
import { resolveConnection, isHouseConfigured, isForbiddenCliBypass } from '../../../lib/server/houseConnection'
import { checkAndIncrement } from '../../../lib/server/genCap'

// Runs the ONE bounded generation prompt through whichever local connection
// the user picked. Local-only today: credentials arrive with the request from
// this browser and go nowhere except the provider. Codex/Claude subscription
// support rides the local CLI login on this machine.

export const maxDuration = 300

const CLI_TIMEOUT_MS = 240_000

function hardendedEnv(): NodeJS.ProcessEnv {
  const extraPaths = [`${homedir()}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'].join(':')
  return {
    ...process.env,
    PATH: `${process.env.PATH ?? ''}:${extraPaths}`,
  }
}

function cliErrorMessage(
  prefix: string,
  err: Error & { code?: string | number | null },
  stdout: string,
  stderr: string,
): string {
  if (err.code === 'ENOENT') {
    const cliName = prefix.split(' ')[0]
    return `${cliName} not found — set GHOSTED_${cliName.toUpperCase()}_BIN or install ${cliName}`
  }
  const exitSuffix = typeof err.code === 'number' ? ` (exit ${err.code})` : ''
  const detail = stderr.trim() || stdout.slice(-300).trim() || err.message
  return `${prefix}${exitSuffix}: ${detail.slice(0, 300)}`
}

interface GenerateBody {
  auth?: AIAuth
  prompt?: string
  /** Optional model override. When present, routing is based on this model's provider. */
  model?: string
  applicationId?: string
  task?: GenerationRunRecord['task']
}

export async function POST(req: NextRequest) {
  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { auth: requestAuth, prompt } = body
  if (!prompt || prompt.length < 50) return NextResponse.json({ error: 'missing prompt' }, { status: 400 })
  if (prompt.length > 200_000) return NextResponse.json({ error: 'prompt too large' }, { status: 400 })

  // Resolve which auth to use: caller-supplied or the house account fallback.
  const resolved = resolveConnection(requestAuth)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 })
  }
  const { auth, usingHouse } = resolved

  // Apply the per-session daily cap only when using the house account.
  if (usingHouse) {
    const limit = Number(process.env.GHOSTED_GEN_DAILY_CAP ?? 30)
    // Derive a session id from the 'ghosted_sid' cookie, creating it if absent.
    const existingSid = req.cookies.get('ghosted_sid')?.value
    const sessionId = existingSid ?? randomUUID()

    const cap = await checkAndIncrement(sessionId, limit)
    if (!cap.ok) {
      const res = NextResponse.json(
        { error: 'Daily limit reached on the shared account — connect your own AI in Settings to keep going, or try tomorrow.' },
        { status: 429 },
      )
      // Ensure the sid cookie is set even on 429 so the user doesn't get a
      // fresh counter on the very next request.
      if (!existingSid) {
        res.cookies.set('ghosted_sid', sessionId, { httpOnly: true, sameSite: 'lax', path: '/' })
      }
      return res
    }
    // Will attach the sid cookie to the success response below.
  }

  const legacyModel = modelForAuth(auth)
  // Resolve which runner + effective model to use.
  // House account: force the house model — ignore any client model to avoid misrouting.
  const bodyModel = !usingHouse && typeof body.model === 'string' ? body.model.trim() : undefined
  const catalogProvider = bodyModel
    ? findCatalogEntry(FALLBACK_MODEL_CATALOG, 'anthropic', bodyModel)?.provider ??
      findCatalogEntry(FALLBACK_MODEL_CATALOG, 'openai', bodyModel)?.provider ??
      findCatalogEntry(FALLBACK_MODEL_CATALOG, 'codex', bodyModel)?.provider
    : undefined
  const runnerResult = resolveRunner(bodyModel, auth, catalogProvider, legacyModel)
  if (runnerResult.runner === 'error') {
    return NextResponse.json({ error: runnerResult.errorMessage ?? 'invalid model' }, { status: 400 })
  }

  // Server CLIs are the house account's private path. A BYOK request must not
  // route through them (it would bypass the house daily cap).
  if (isHouseConfigured() && isForbiddenCliBypass(usingHouse, runnerResult.runner)) {
    return NextResponse.json(
      { error: 'that model runs on the shared account — clear your own connection in Settings to use it' },
      { status: 400 },
    )
  }

  const model = runnerResult.model
  const started = Date.now()
  try {
    let text: string
    let usage: unknown = null

    if (runnerResult.runner === 'codex_cli') {
      text = await runCodexCLI(prompt, model)
    } else if (runnerResult.runner === 'claude_cli') {
      text = await runClaudeCLI(prompt, model)
    } else if (runnerResult.runner === 'anthropic_api') {
      const result = await callAnthropic(prompt, auth, model)
      text = result.text
      usage = result.usage
    } else if (runnerResult.runner === 'openai_api') {
      const result = await callOpenAI(prompt, auth, model)
      text = result.text
      usage = result.usage
    } else {
      // legacy — route by auth provider/method as before
      if (auth.provider === 'codex') {
        text = await runCodexCLI(prompt, model)
      } else if (auth.method === 'local_cli') {
        text = await runClaudeCLI(prompt, model)
      } else if (auth.provider === 'anthropic') {
        const result = await callAnthropic(prompt, auth, model)
        text = result.text
        usage = result.usage
      } else {
        const result = await callOpenAI(prompt, auth, model)
        text = result.text
        usage = result.usage
      }
    }

    const run = await recordGenerationRun({
      auth,
      model,
      prompt,
      text,
      rawUsage: usage,
      started,
      ok: true,
      usingHouse,
      ...(body.applicationId ? { applicationId: body.applicationId } : {}),
      ...(body.task ? { task: body.task } : {}),
    })
    console.log(JSON.stringify({ kind: 'generate', usingHouse, run }))
    const successRes = NextResponse.json({ text, model, run })
    // Persist the session id cookie when using the house account.
    if (usingHouse) {
      const existingSid = req.cookies.get('ghosted_sid')?.value
      if (!existingSid) {
        successRes.cookies.set('ghosted_sid', randomUUID(), { httpOnly: true, sameSite: 'lax', path: '/' })
      }
    }
    return successRes
  } catch (e) {
    let message = e instanceof Error ? e.message : 'generation failed'
    // A failing BYOK connection on a hosted deploy has a one-click way out —
    // say so instead of leaving the visitor stuck on a dead key.
    if (!usingHouse && isHouseConfigured()) {
      message += ' — your connected key failed; disconnect it in Settings to use the shared account instead'
    }
    await recordGenerationRun({ auth, model, prompt, text: '', rawUsage: null, started, ok: false, usingHouse, error: message }).catch(() => undefined)
    console.log(JSON.stringify({ kind: 'generate_error', method: auth.method, provider: auth.provider, model, ms: Date.now() - started, message }))
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function runClaudeCLI(prompt: string, model: string): Promise<string> {
  const bin = process.env.GHOSTED_CLAUDE_BIN ?? 'claude'
  return new Promise((resolve, reject) => {
    // Strip any inherited API key so the claude CLI falls back to the machine's
    // Claude Code subscription login — an env key silently overrides the profile.
    const { ANTHROPIC_API_KEY: _k, ANTHROPIC_AUTH_TOKEN: _t, ...subscriptionEnv } = hardendedEnv()
    const child = execFile(
      bin,
      ['-p', '--model', model],
      { timeout: CLI_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, env: subscriptionEnv },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(cliErrorMessage('claude CLI failed', err, stdout, stderr)))
          return
        }
        resolve(stdout.trim())
      },
    )
    child.stdin?.write(prompt)
    child.stdin?.end()
  })
}

async function runCodexCLI(prompt: string, model: string): Promise<string> {
  const bin = process.env.GHOSTED_CODEX_BIN ?? 'codex'
  const outPath = join(tmpdir(), `ghosted-codex-${randomUUID()}.txt`)
  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        bin,
        // --skip-git-repo-check: the server cwd is not a git repo; without the
        // flag codex refuses to run ("Not inside a trusted directory").
        ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--model', model, '-c', 'model_reasoning_effort="low"', '--output-last-message', outPath, '-'],
        { timeout: CLI_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, env: hardendedEnv(), cwd: process.cwd() },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(cliErrorMessage('codex CLI failed', err, stdout, stderr)))
            return
          }
          resolve()
        },
      )
      child.stdin?.write(prompt)
      child.stdin?.end()
    })
    return (await readFile(outPath, 'utf8')).trim()
  } finally {
    await rm(outPath, { force: true }).catch(() => undefined)
  }
}

async function callAnthropic(prompt: string, auth: AIAuth, model: string): Promise<{ text: string; usage: unknown }> {
  if (!auth.key) throw new Error('connection has no key')
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  }
  if (auth.method === 'oauth_token') {
    headers.authorization = `Bearer ${auth.key}`
    headers['anthropic-beta'] = 'oauth-2025-04-20'
  } else {
    headers['x-api-key'] = auth.key
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(CLI_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    // Always include the HTTP status — a bare provider message like "Error"
    // is undiagnosable from the logs.
    const detail = errBody?.error?.message
    throw new Error(detail ? `Anthropic API ${res.status}: ${detail}` : `Anthropic API answered ${res.status}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: unknown }
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
  if (!text) throw new Error('empty model response')
  return { text, usage: data.usage ?? null }
}

async function callOpenAI(prompt: string, auth: AIAuth, model: string): Promise<{ text: string; usage: unknown }> {
  if (!auth.key) throw new Error('connection has no key')
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${auth.key}`,
    },
    signal: AbortSignal.timeout(CLI_TIMEOUT_MS),
    body: JSON.stringify({ model, input: prompt, max_output_tokens: 4000 }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const detail = errBody?.error?.message
    throw new Error(detail ? `OpenAI API ${res.status}: ${detail}` : `OpenAI API answered ${res.status}`)
  }
  const data = (await res.json()) as { output_text?: string; usage?: unknown; output?: { content?: { type?: string; text?: string }[] }[] }
  const text =
    data.output_text ??
    (data.output ?? [])
      .flatMap((o) => o.content ?? [])
      .filter((c) => typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n')
  if (!text) throw new Error('empty model response')
  return { text, usage: data.usage ?? null }
}
