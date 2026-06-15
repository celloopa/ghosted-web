// cvExtract.ts — CV source extraction helpers.
// Turns uploaded PDFs / pasted text into clean plain text.
// The LLM call (text → JSON Resume) happens elsewhere via /api/generate.

import { execFile as _execFile } from 'node:child_process'
import { writeFile, readFile, unlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { homedir } from 'node:os'

const execFile = promisify(_execFile)

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CVSource = {
  kind: 'pdf' | 'text'
  data: string        // pdf → base64-encoded bytes; text → raw string
  filename?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SOURCES = 5
const MAX_PDF_DECODED_BYTES = 8 * 1024 * 1024   // 8 MB per PDF
const MAX_TEXT_CHARS = 200_000
const MAX_COMBINED_CHARS = 60_000
const PDFTOTEXT_BIN = process.env.GHOSTED_PDFTOTEXT_BIN ?? 'pdftotext'
const PDFTOTEXT_TIMEOUT_MS = 4_000
const PDFTOTEXT_MAX_BUFFER = 10 * 1024 * 1024   // 10 MB stdout buffer
const PDFTOPPM_BIN = process.env.GHOSTED_PDFTOPPM_BIN ?? 'pdftoppm'
const PDFTOPPM_TIMEOUT_MS = 20_000
const PDFTOPPM_MAX_PAGES = 6

// PDF magic bytes: %PDF
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46])

// ─────────────────────────────────────────────────────────────────────────────
// Environment helper (mirrors typstExport.ts pattern exactly)
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
// validateSources — PURE, no IO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate and coerce raw unknown input into CVSource[].
 * Returns { ok: true, sources } on success or { ok: false, error } on failure.
 * PURE — safe to unit test without any IO.
 */
export function validateSources(
  raw: unknown,
): { ok: true; sources: CVSource[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'sources must be an array' }
  }
  if (raw.length === 0) {
    return { ok: false, error: 'sources array must not be empty' }
  }
  if (raw.length > MAX_SOURCES) {
    return { ok: false, error: `too many sources: max ${MAX_SOURCES}, got ${raw.length}` }
  }

  let totalDecodedBytes = 0

  const sources: CVSource[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>

    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: `source[${i}] must be an object` }
    }

    const kind = item['kind']
    if (kind !== 'pdf' && kind !== 'text') {
      return { ok: false, error: `source[${i}].kind must be "pdf" or "text", got ${JSON.stringify(kind)}` }
    }

    const data = item['data']
    if (typeof data !== 'string') {
      return { ok: false, error: `source[${i}].data must be a string` }
    }

    const filename = typeof item['filename'] === 'string' ? item['filename'] : undefined

    if (kind === 'pdf') {
      // Decode to check size; Buffer.from with 'base64' is lenient — verify length
      const decoded = Buffer.from(data, 'base64')
      if (decoded.length > MAX_PDF_DECODED_BYTES) {
        return {
          ok: false,
          error: `source[${i}] PDF exceeds max size of ${MAX_PDF_DECODED_BYTES / 1024 / 1024}MB`,
        }
      }
      totalDecodedBytes += decoded.length
    } else {
      // text
      if (data.length > MAX_TEXT_CHARS) {
        return {
          ok: false,
          error: `source[${i}] text exceeds max length of ${MAX_TEXT_CHARS} chars`,
        }
      }
      totalDecodedBytes += data.length
    }

    sources.push({ kind, data, filename })
  }

  // Total decoded size cap (same 8 MB ceiling, across all sources combined)
  if (totalDecodedBytes > MAX_PDF_DECODED_BYTES) {
    return {
      ok: false,
      error: `total decoded size exceeds ${MAX_PDF_DECODED_BYTES / 1024 / 1024}MB`,
    }
  }

  return { ok: true, sources }
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeText — PURE, no IO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip control characters (except newline \n and tab \t), collapse 3+ consecutive
 * blank lines to 2, trim leading/trailing whitespace, and cap at MAX_COMBINED_CHARS.
 * PURE — safe to unit test without any IO.
 */
export function sanitizeText(s: string): string {
  // Strip control chars except \n (0x0A) and \t (0x09).
  // Range \x00-\x08 covers NUL–BS; \x0B-\x1F covers VT, FF, CR (0x0D), and everything
  // up to US — this removes \r which we don't want in extracted text.
  // eslint-disable-next-line no-control-regex
  let out = s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')

  // Collapse 3+ consecutive blank lines (lines containing only whitespace) to 2
  out = out.replace(/(\n[ \t]*){3,}/g, '\n\n')

  // Trim
  out = out.trim()

  // Cap length
  if (out.length > MAX_COMBINED_CHARS) {
    out = out.slice(0, MAX_COMBINED_CHARS)
  }

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// computePageCount — PURE, no IO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate total page count for a set of sources.
 * PDFs: counted as 1 page each (pdftotext does not expose page count; the
 * vision path uses pdftoppm to render actual pages, which is the ground truth).
 * Text sources: treated as having no pages (they never need vision).
 * Returns 1 at minimum so callers can safely divide by it.
 * PURE — safe to unit test without any IO.
 */
export function computePageCount(sources: CVSource[]): number {
  const pdfCount = sources.filter((s) => s.kind === 'pdf').length
  return Math.max(1, pdfCount)
}

// ─────────────────────────────────────────────────────────────────────────────
// renderPdfPages — async, shells out to pdftoppm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render up to `maxPages` pages of a base64-encoded PDF to PNG images.
 * Each page becomes a base64-encoded PNG string.
 *
 * Uses pdftoppm (poppler) at GHOSTED_PDFTOPPM_BIN or 'pdftoppm'.
 * Temp files are always cleaned up (finally block).
 * Throws a descriptive Error on failure so the caller can catch it cleanly.
 */
export async function renderPdfPages(
  pdfBase64: string,
  maxPages = PDFTOPPM_MAX_PAGES,
): Promise<{ pageImagesBase64: string[]; pageCount: number }> {
  const uid = randomUUID()
  const tmpPdf = join(tmpdir(), `cv-vision-${uid}.pdf`)
  const outPrefix = join(tmpdir(), `cv-vision-${uid}-page`)
  const env = hardenedEnv()

  try {
    const decoded = Buffer.from(pdfBase64, 'base64')
    await writeFile(tmpPdf, decoded)

    // pdftoppm -png -r 150 -f 1 -l <maxPages> <input> <output-prefix>
    // Produces files: <outPrefix>-1.png, <outPrefix>-2.png, …
    await execFile(
      PDFTOPPM_BIN,
      ['-png', '-r', '150', '-f', '1', '-l', String(maxPages), tmpPdf, outPrefix],
      { env, timeout: PDFTOPPM_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
    )

    // Collect produced PNG files — pdftoppm names them <prefix>-<N>.png
    // where N is zero-padded to the number of digits needed for the page count.
    const dir = tmpdir()
    const prefix = `cv-vision-${uid}-page-`
    const all = await readdir(dir)
    const pageFiles = all
      .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
      .sort()

    if (pageFiles.length === 0) {
      throw new Error('pdftoppm produced no PNG files — the PDF may be empty or corrupt')
    }

    const pageImagesBase64: string[] = []
    for (const file of pageFiles) {
      const buf = await readFile(join(dir, file))
      pageImagesBase64.push(buf.toString('base64'))
    }

    return { pageImagesBase64, pageCount: pageImagesBase64.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`renderPdfPages failed: ${msg}`)
  } finally {
    // Clean up the source PDF
    await unlink(tmpPdf).catch(() => undefined)
    // Clean up produced PNGs
    try {
      const dir = tmpdir()
      const prefix = `cv-vision-${uid}-page-`
      const all = await readdir(dir)
      await Promise.all(
        all
          .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
          .map((f) => unlink(join(dir, f)).catch(() => undefined)),
      )
    } catch {
      // best-effort cleanup
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// extractFromSources — async, shells out to pdftotext
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect whether a Buffer looks like a DOCX (ZIP with specific signature).
 * DOCX files are ZIP archives starting with PK\x03\x04.
 */
function isDocx(buf: Buffer, filename?: string): boolean {
  // Filename-based detection
  if (filename && filename.toLowerCase().endsWith('.docx')) return true
  // Magic bytes: ZIP starts with PK (0x50 0x4B)
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4B) return true
  return false
}

/**
 * Check whether a Buffer has PDF magic bytes (%PDF).
 */
function hasPdfMagic(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).equals(PDF_MAGIC)
}

/**
 * Extract text from a list of CVSources:
 * - 'text' sources are sanitized and passed through directly.
 * - 'pdf' sources are written to a temp file, then pdftotext is run on them.
 * - DOCX or non-PDF binary is skipped with a warning.
 *
 * Returns combined text (capped at MAX_COMBINED_CHARS), any warning strings,
 * and a `needsVision` flag (true when pdftotext output is too thin to trust).
 * Single pdftotext failures push a warning and continue (non-fatal).
 *
 * NOTE: `needsVision` uses isPoorExtraction from @ghosted/core, imported lazily
 * so the function still compiles even before core exports it. Falls back to
 * false when the import is unavailable.
 */
export async function extractFromSources(
  sources: CVSource[],
): Promise<{ text: string; warnings: string[]; needsVision: boolean }> {
  const warnings: string[] = []
  const parts: string[] = []
  const env = hardenedEnv()

  for (const source of sources) {
    if (source.kind === 'text') {
      const cleaned = sanitizeText(source.data)
      if (cleaned) {
        const label = source.filename ? `--- ${source.filename} ---` : null
        if (label) parts.push(label)
        parts.push(cleaned)
      }
      continue
    }

    // kind === 'pdf'
    const decoded = Buffer.from(source.data, 'base64')

    // Detect DOCX or PDF magic mismatch
    if (isDocx(decoded, source.filename)) {
      warnings.push("DOCX isn't supported yet — paste the text or upload a PDF")
      continue
    }
    if (!hasPdfMagic(decoded)) {
      const name = source.filename ?? 'unknown'
      warnings.push(`"${name}" doesn't look like a PDF — skipping`)
      continue
    }

    const tmpPath = join(tmpdir(), `cv-${randomUUID()}.pdf`)
    try {
      await writeFile(tmpPath, decoded)
      const { stdout } = await execFile(PDFTOTEXT_BIN, [tmpPath, '-'], {
        env,
        timeout: PDFTOTEXT_TIMEOUT_MS,
        maxBuffer: PDFTOTEXT_MAX_BUFFER,
      })
      const cleaned = sanitizeText(stdout)
      if (cleaned) {
        const label = source.filename ? `--- ${source.filename} ---` : null
        if (label) parts.push(label)
        parts.push(cleaned)
      }
    } catch (err) {
      const name = source.filename ?? 'unnamed PDF'
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`Failed to extract text from "${name}": ${msg.slice(0, 200)}`)
    } finally {
      try {
        await unlink(tmpPath)
      } catch {
        // best-effort cleanup
      }
    }
  }

  // Join parts and cap combined result
  let combined = parts.join('\n\n')
  if (combined.length > MAX_COMBINED_CHARS) {
    combined = combined.slice(0, MAX_COMBINED_CHARS)
  }

  const finalText = combined.trim()

  // Compute needsVision via isPoorExtraction from @ghosted/core.
  // Import is direct (core is always in the workspace); we only guard defensively.
  let needsVision = false
  try {
    const { isPoorExtraction } = await import('@ghosted/core')
    const pageCount = computePageCount(sources)
    needsVision = isPoorExtraction(finalText, pageCount)
  } catch {
    // Core not yet exporting isPoorExtraction — keep needsVision false.
  }

  return { text: finalText, warnings, needsVision }
}
