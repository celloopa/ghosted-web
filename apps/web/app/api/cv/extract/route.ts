import { NextRequest, NextResponse } from 'next/server'
import { validateSources, extractFromSources } from '../../../../lib/server/cvExtract'

// Allow up to 60 seconds for PDF extraction (pdftotext + multiple sources).
export const maxDuration = 60

export async function POST(req: NextRequest) {
  let body: { sources?: unknown }
  try {
    body = (await req.json()) as { sources?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  // ── Validate sources ──────────────────────────────────────────────────────

  const validation = validateSources(body.sources)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // ── Extract text ──────────────────────────────────────────────────────────

  const started = Date.now()
  const { text, warnings, needsVision } = await extractFromSources(validation.sources)
  const ms = Date.now() - started

  if (!text) {
    console.log(
      JSON.stringify({
        kind: 'cv_extract',
        sources: validation.sources.length,
        chars: 0,
        warnings: warnings.length,
        needsVision,
        ms,
      }),
    )
    return NextResponse.json(
      { error: 'no readable text found', warnings, needsVision: true },
      { status: 422 },
    )
  }

  console.log(
    JSON.stringify({
      kind: 'cv_extract',
      sources: validation.sources.length,
      chars: text.length,
      warnings: warnings.length,
      needsVision,
      ms,
    }),
  )

  return NextResponse.json({ text, warnings, needsVision })
}
