// cvVision.ts — multimodal vision call helper for the CV pipeline.
// Accepts rendered PDF page images (base64 PNG) + a prompt and calls the
// appropriate provider, returning the raw model text response.
//
// Providers:
//  anthropic (oauth_token / api_key) → /v1/messages with image content blocks
//  openai (api_key)                  → /v1/responses with input_image content
//  claude_cli (local_cli)            → `claude -p` with image paths written to disk
//  codex (codex)                     → `codex exec` with image paths written to disk

import { execFile as _execFile } from 'node:child_process'
import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { AIAuth } from '@ghosted/core'

const CLI_TIMEOUT_MS = 120_000

// ─────────────────────────────────────────────────────────────────────────────
// Hardened env (mirrors generate route exactly)
// ─────────────────────────────────────────────────────────────────────────────

function hardenedEnv(): NodeJS.ProcessEnv {
  const home = homedir()
  const extraPaths = [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'].join(':')
  return {
    ...process.env,
    PATH: `${process.env.PATH ?? ''}:${extraPaths}`,
    HOME: process.env.HOME ?? home,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// runVision — main entrypoint
// ─────────────────────────────────────────────────────────────────────────────

export interface VisionInput {
  auth: AIAuth
  model: string
  prompt: string
  imagesBase64: string[]  // PNG pages, base64-encoded
}

export interface VisionResult {
  text: string
  usage?: unknown
}

/**
 * Call the vision provider with the rendered page images + prompt.
 * Returns raw model text (caller runs parseCVResult on it).
 * Throws on any provider error.
 */
export async function runVision({ auth, model, prompt, imagesBase64 }: VisionInput): Promise<VisionResult> {
  const isLocalCLI = auth.method === 'local_cli'
  const isCodex = auth.provider === 'codex'
  const isAnthropic = auth.provider === 'anthropic' && !isLocalCLI
  const isOpenAI = auth.provider === 'openai'

  if (isLocalCLI || isCodex) {
    return runVisionViaCLI(auth, model, prompt, imagesBase64)
  }
  if (isAnthropic) {
    return callAnthropicVision(auth, model, prompt, imagesBase64)
  }
  if (isOpenAI) {
    return callOpenAIVision(auth, model, prompt, imagesBase64)
  }

  // Fallback: try anthropic API if we have a key
  if (auth.key) {
    return callAnthropicVision(auth, model, prompt, imagesBase64)
  }

  throw new Error(`Unsupported provider/method combination: ${auth.provider}/${auth.method}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic vision
// ─────────────────────────────────────────────────────────────────────────────

async function callAnthropicVision(
  auth: AIAuth,
  model: string,
  prompt: string,
  imagesBase64: string[],
): Promise<VisionResult> {
  if (!auth.key) throw new Error('Anthropic connection has no key')

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

  // Build content blocks: one image block per page, then the text prompt
  const imageBlocks = imagesBase64.map((data) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/png' as const, data },
  }))
  const content = [...imageBlocks, { type: 'text' as const, text: prompt }]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(CLI_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content }],
    }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(errBody?.error?.message ?? `Anthropic API answered ${res.status}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: unknown }
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
  if (!text) throw new Error('empty model response from Anthropic vision')
  return { text, usage: data.usage ?? undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI vision
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenAIVision(
  auth: AIAuth,
  model: string,
  prompt: string,
  imagesBase64: string[],
): Promise<VisionResult> {
  if (!auth.key) throw new Error('OpenAI connection has no key')

  // Build multimodal content array for /v1/responses
  const imageInputs = imagesBase64.map((data) => ({
    type: 'input_image' as const,
    image_url: `data:image/png;base64,${data}`,
  }))
  const content = [...imageInputs, { type: 'input_text' as const, text: prompt }]

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${auth.key}`,
    },
    signal: AbortSignal.timeout(CLI_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      input: [{ role: 'user', content }],
      max_output_tokens: 4000,
    }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(errBody?.error?.message ?? `OpenAI API answered ${res.status}`)
  }
  const data = (await res.json()) as {
    output_text?: string
    usage?: unknown
    output?: { content?: { type?: string; text?: string }[] }[]
  }
  const text =
    data.output_text ??
    (data.output ?? [])
      .flatMap((o) => o.content ?? [])
      .filter((c) => typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n')
  if (!text) throw new Error('empty model response from OpenAI vision')
  return { text, usage: data.usage ?? undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local CLI vision (claude -p / codex exec)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write page images to temp files, then invoke the CLI with a prompt that
 * includes the absolute paths — Claude Code / Codex can read local images.
 * Cleans up temp image files on completion.
 */
async function runVisionViaCLI(
  auth: AIAuth,
  model: string,
  prompt: string,
  imagesBase64: string[],
): Promise<VisionResult> {
  const uid = randomUUID()
  const tmpPaths: string[] = []

  try {
    // Write each page image to a temp file
    for (let i = 0; i < imagesBase64.length; i++) {
      const p = join(tmpdir(), `cv-vision-cli-${uid}-${i + 1}.png`)
      await writeFile(p, Buffer.from(imagesBase64[i]!, 'base64'))
      tmpPaths.push(p)
    }

    const pathList = tmpPaths.map((p, i) => `Page ${i + 1}: ${p}`).join('\n')
    const fullPrompt = `Read these résumé page images and convert to JSON Resume:\n${pathList}\n\n${prompt}`

    if (auth.provider === 'codex') {
      return await runCodexVisionCLI(model, fullPrompt, uid)
    } else {
      return await runClaudeVisionCLI(model, fullPrompt)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Your local CLI could not read the images — connect an Anthropic or OpenAI API key in Settings for the screenshot fallback. (${msg})`,
    )
  } finally {
    await Promise.all(tmpPaths.map((p) => rm(p, { force: true }).catch(() => undefined)))
  }
}

function runClaudeVisionCLI(model: string, prompt: string): Promise<VisionResult> {
  const bin = process.env.GHOSTED_CLAUDE_BIN ?? 'claude'
  const { ANTHROPIC_API_KEY: _k, ANTHROPIC_AUTH_TOKEN: _t, ...subscriptionEnv } = hardenedEnv()

  return new Promise((resolve, reject) => {
    const child = _execFile(
      bin,
      ['-p', '--model', model],
      { timeout: CLI_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, env: subscriptionEnv },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code
          const exitCode = (err as { code?: string | number }).code
          const suffix = typeof exitCode === 'number' ? ` (exit ${exitCode})` : ''
          const detail = code === 'ENOENT'
            ? 'claude not found — install Claude Code or use an API key'
            : `${(stderr.trim() || stdout.slice(-200).trim() || err.message).slice(0, 200)}${suffix}`
          reject(new Error(detail))
          return
        }
        const text = stdout.trim()
        if (!text) { reject(new Error('empty response from claude CLI')); return }
        resolve({ text })
      },
    )
    child.stdin?.write(prompt)
    child.stdin?.end()
  })
}

async function runCodexVisionCLI(model: string, prompt: string, uid: string): Promise<VisionResult> {
  const bin = process.env.GHOSTED_CODEX_BIN ?? 'codex'
  const outPath = join(tmpdir(), `cv-vision-codex-${uid}.txt`)
  try {
    await new Promise<void>((resolve, reject) => {
      const child = _execFile(
        bin,
        ['exec', '--ephemeral', '--sandbox', 'read-only', '--model', model, '-c', 'model_reasoning_effort="low"', '--output-last-message', outPath, '-'],
        { timeout: CLI_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, env: hardenedEnv(), cwd: process.cwd() },
        (err, stdout, stderr) => {
          if (err) {
            const code = (err as NodeJS.ErrnoException).code
            const detail = code === 'ENOENT'
              ? 'codex not found'
              : `${(stderr.trim() || stdout.slice(-200).trim() || err.message).slice(0, 200)}`
            reject(new Error(detail))
            return
          }
          resolve()
        },
      )
      child.stdin?.write(prompt)
      child.stdin?.end()
    })
    const { readFile } = await import('node:fs/promises')
    const text = (await readFile(outPath, 'utf8')).trim()
    if (!text) throw new Error('empty response from codex CLI')
    return { text }
  } finally {
    await rm(outPath, { force: true }).catch(() => undefined)
  }
}
