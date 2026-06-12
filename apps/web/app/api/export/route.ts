import { stat, readdir } from 'node:fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { buildResumeModel, buildExpectations, normalizeDocStyle } from '@ghosted/core'
import { runExport } from '../../../lib/server/typstExport'
import { resolveExportDir } from '../../../lib/server/resolveExportFile'

// Keep the connection alive long enough for two typst compiles + ATS runs.
export const maxDuration = 120

const APP_ID_RE = /^[a-zA-Z0-9-]+$/

interface ExportBody {
  appId?: unknown
  cvJson?: unknown
  summary?: unknown
  coverLetter?: unknown
  bulletOrder?: unknown
  skillsOrder?: unknown
  matchedKeywords?: unknown
  style?: unknown
}

export async function POST(req: NextRequest) {
  let body: ExportBody
  try {
    body = (await req.json()) as ExportBody
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  // ── Validate required fields ──────────────────────────────────────────────

  if (typeof body.appId !== 'string' || !body.appId) {
    return NextResponse.json({ error: 'missing appId' }, { status: 400 })
  }
  if (!APP_ID_RE.test(body.appId)) {
    return NextResponse.json({ error: 'appId must match [a-zA-Z0-9-]' }, { status: 400 })
  }
  if (typeof body.cvJson !== 'string' || !body.cvJson) {
    return NextResponse.json({ error: 'missing cvJson' }, { status: 400 })
  }
  if (typeof body.coverLetter !== 'string' || !body.coverLetter) {
    return NextResponse.json({ error: 'missing coverLetter' }, { status: 400 })
  }

  // ── Build resume model ────────────────────────────────────────────────────

  const resumeModel = buildResumeModel(body.cvJson, {
    summary: typeof body.summary === 'string' ? body.summary : undefined,
    bulletOrder: Array.isArray(body.bulletOrder)
      ? (body.bulletOrder as { name: string; order: number[] }[])
      : undefined,
    skillsOrder: Array.isArray(body.skillsOrder)
      ? (body.skillsOrder as string[])
      : undefined,
  })

  if (!resumeModel) {
    return NextResponse.json({ error: 'cvJson is not a valid JSON Resume (missing name or email)' }, { status: 400 })
  }

  // ── Build expectations ────────────────────────────────────────────────────

  const matchedKeywords = Array.isArray(body.matchedKeywords)
    ? (body.matchedKeywords as string[]).filter((k): k is string => typeof k === 'string')
    : []
  const expectations = buildExpectations(resumeModel, matchedKeywords)

  // ── Run export ────────────────────────────────────────────────────────────

  const style = normalizeDocStyle(body.style)

  const started = Date.now()
  try {
    const result = await runExport({
      appId: body.appId,
      resumeModel,
      coverLetter: body.coverLetter,
      expectations,
      style,
    })

    const ms = Date.now() - started
    console.log(
      JSON.stringify({
        kind: 'export',
        appId: body.appId,
        ms,
        resumeAts: result.resume.ats.pass,
        coverAts: result.cover.ats.pass,
      }),
    )

    return NextResponse.json({
      resume: {
        pdfBase64: result.resume.pdfBase64,
        ats: result.resume.ats,
      },
      cover: {
        pdfBase64: result.cover.pdfBase64,
        ats: result.cover.ats,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export failed'
    console.error(JSON.stringify({ kind: 'export_error', appId: body.appId, ms: Date.now() - started, message }))
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// ── GET /api/export?appId=<id> ────────────────────────────────────────────────
// Returns { files: [{ name, size, mtime }] } for PDFs that exist in the export dir.
// Missing dir → { files: [] }. Invalid appId → 400.

export async function GET(req: NextRequest) {
  const appId = req.nextUrl.searchParams.get('appId')

  if (!appId) {
    return NextResponse.json({ error: 'missing appId' }, { status: 400 })
  }
  if (!APP_ID_RE.test(appId)) {
    return NextResponse.json({ error: 'appId must match [a-zA-Z0-9-]' }, { status: 400 })
  }

  let exportDir: string
  try {
    exportDir = resolveExportDir(appId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid request'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const ALLOWED = new Set(['resume.pdf', 'cover-letter.pdf'])

  try {
    const entries = await readdir(exportDir)
    const files: { name: string; size: number; mtime: string }[] = []
    for (const entry of entries) {
      if (!ALLOWED.has(entry)) continue
      try {
        const s = await stat(`${exportDir}/${entry}`)
        files.push({ name: entry, size: s.size, mtime: s.mtime.toISOString() })
      } catch {
        // file disappeared between readdir and stat — skip
      }
    }
    return NextResponse.json({ files })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return NextResponse.json({ files: [] })
    }
    return NextResponse.json({ error: 'could not read export directory' }, { status: 500 })
  }
}
