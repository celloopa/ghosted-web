import { NextRequest, NextResponse } from 'next/server'
import type { AIAuth } from '@ghosted/core'
import { buildCVVisionPrompt } from '@ghosted/core'
import { validateSources, renderPdfPages } from '../../../../lib/server/cvExtract'
import { runVision } from '../../../../lib/server/cvVision'
import { resolveConnection } from '../../../../lib/server/houseConnection'

// Vision extraction can take a while (rendering PDFs + model call).
export const maxDuration = 120

const MAX_TOTAL_IMAGES = 8

interface VisionBody {
  auth?: AIAuth
  model?: string
  sources?: unknown
  existingCvJson?: string
}

export async function POST(req: NextRequest) {
  let body: VisionBody
  try {
    body = (await req.json()) as VisionBody
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  // ── Validate sources ──────────────────────────────────────────────────────
  const validation = validateSources(body.sources)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // ── Resolve auth (house account or caller-supplied) ───────────────────────
  const resolved = resolveConnection(body.auth)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 })
  }
  const { auth } = resolved

  // Default to the model on the auth, or a capable vision model
  const model =
    (typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null) ??
    auth.model ??
    (auth.provider === 'openai' ? 'gpt-4o' : 'claude-opus-4-5')

  // ── Render PDF pages ──────────────────────────────────────────────────────
  const started = Date.now()
  const warnings: string[] = []
  let allImages: string[] = []

  const pdfSources = validation.sources.filter((s) => s.kind === 'pdf')
  if (pdfSources.length === 0) {
    return NextResponse.json(
      { error: 'no PDF sources supplied — vision requires at least one PDF' },
      { status: 422 },
    )
  }

  for (const source of pdfSources) {
    if (allImages.length >= MAX_TOTAL_IMAGES) break
    const remaining = MAX_TOTAL_IMAGES - allImages.length
    try {
      const { pageImagesBase64 } = await renderPdfPages(source.data, remaining)
      allImages = allImages.concat(pageImagesBase64)
    } catch (err) {
      const name = source.filename ?? 'unnamed PDF'
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`Could not render "${name}": ${msg.slice(0, 200)}`)
    }
  }

  if (allImages.length > MAX_TOTAL_IMAGES) {
    warnings.push(`Capped at ${MAX_TOTAL_IMAGES} images total — later pages were omitted`)
    allImages = allImages.slice(0, MAX_TOTAL_IMAGES)
  }

  if (allImages.length === 0) {
    return NextResponse.json(
      { error: 'could not render the résumé pages', warnings },
      { status: 422 },
    )
  }

  // ── Build vision prompt ───────────────────────────────────────────────────
  const prompt = buildCVVisionPrompt({
    pageCount: allImages.length,
    existingCvJson: typeof body.existingCvJson === 'string' ? body.existingCvJson : undefined,
  })

  // ── Call vision model ─────────────────────────────────────────────────────
  let text: string
  let usage: unknown
  const ok_flag = { ok: false }
  try {
    const result = await runVision({ auth, model, prompt, imagesBase64: allImages })
    text = result.text
    usage = result.usage
    ok_flag.ok = true
  } catch (err) {
    const ms = Date.now() - started
    const message = err instanceof Error ? err.message : 'vision call failed'
    console.log(JSON.stringify({ kind: 'cv_vision', images: allImages.length, ms, ok: false, error: message }))
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const ms = Date.now() - started
  console.log(JSON.stringify({ kind: 'cv_vision', images: allImages.length, ms, ok: ok_flag.ok, model }))

  // Return raw model text + warnings; client runs parseCVResult.
  return NextResponse.json({ text, warnings: warnings.length > 0 ? warnings : undefined, usage })
}
