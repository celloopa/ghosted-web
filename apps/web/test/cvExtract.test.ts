// Pure-function unit tests for cvExtract.ts.
// Does NOT invoke pdftotext or any IO — only validateSources and sanitizeText.
import { describe, it, expect } from 'vitest'
import { validateSources, sanitizeText } from '../lib/server/cvExtract'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal valid base64 PDF stub (just the %PDF magic, padded). */
function makePdfBase64(sizeBytes = 100): string {
  const buf = Buffer.alloc(sizeBytes, 0x00)
  buf.write('%PDF', 0, 'ascii')
  return buf.toString('base64')
}

/** Build a base64 string whose decoded size is exactly `bytes`. */
function makeBase64OfSize(bytes: number): string {
  return Buffer.alloc(bytes, 0x41).toString('base64')  // 0x41 = 'A', no PDF magic
}

// ─────────────────────────────────────────────────────────────────────────────
// validateSources
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSources', () => {
  it('accepts a valid mixed list of pdf and text sources', () => {
    const result = validateSources([
      { kind: 'pdf', data: makePdfBase64(), filename: 'resume.pdf' },
      { kind: 'text', data: 'Hello World', filename: 'notes.txt' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]!.kind).toBe('pdf')
    expect(result.sources[1]!.kind).toBe('text')
  })

  it('accepts sources without optional filename', () => {
    const result = validateSources([{ kind: 'text', data: 'Some text' }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sources[0]!.filename).toBeUndefined()
  })

  it('rejects non-array input', () => {
    const result = validateSources({ kind: 'text', data: 'x' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/array/)
  })

  it('rejects an empty array', () => {
    const result = validateSources([])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/empty/)
  })

  it('rejects more than 5 sources', () => {
    const sources = Array.from({ length: 6 }, () => ({ kind: 'text', data: 'x' }))
    const result = validateSources(sources)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/too many/)
  })

  it('rejects a source with an unknown kind', () => {
    const result = validateSources([{ kind: 'docx', data: 'abc' }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/kind/)
  })

  it('rejects a pdf source whose decoded base64 exceeds 8 MB', () => {
    const over8MB = makeBase64OfSize(8 * 1024 * 1024 + 1)
    const result = validateSources([{ kind: 'pdf', data: over8MB }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/8MB/)
  })

  it('rejects a text source longer than 200k chars', () => {
    const big = 'x'.repeat(200_001)
    const result = validateSources([{ kind: 'text', data: big }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/200000/)
  })

  it('rejects when total decoded size across all sources exceeds 8 MB', () => {
    // Two PDFs each just under 8 MB but together over the cap
    const almostMax = makeBase64OfSize(4 * 1024 * 1024 + 100)
    const result = validateSources([
      { kind: 'pdf', data: almostMax },
      { kind: 'pdf', data: almostMax },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/total decoded size/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeText
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeText', () => {
  it('strips control characters but preserves newlines and tabs', () => {
    // \x00 and \x01 are control chars and get stripped; 'World' is plain text and kept
    const input = 'Hello\x00\x01World\tLine2\nLine3'
    const result = sanitizeText(input)
    expect(result).toBe('HelloWorld\tLine2\nLine3')
    expect(result).toContain('\t')
    expect(result).toContain('\n')
    expect(result).not.toMatch(/[\x00-\x08]/)
  })

  it('collapses 3 or more consecutive blank lines to 2', () => {
    const input = 'A\n\n\n\n\nB'
    const result = sanitizeText(input)
    // Should not contain 3+ consecutive newlines
    expect(result).not.toMatch(/\n\n\n/)
    expect(result).toContain('A')
    expect(result).toContain('B')
  })

  it('trims leading and trailing whitespace', () => {
    const result = sanitizeText('   hello world   ')
    expect(result).toBe('hello world')
  })

  it('caps output at 60,000 characters', () => {
    const big = 'x'.repeat(70_000)
    const result = sanitizeText(big)
    expect(result.length).toBe(60_000)
  })

  it('keeps content within limit unchanged', () => {
    const short = 'Short text here.'
    const result = sanitizeText(short)
    expect(result).toBe(short)
  })

  it('strips carriage-return-like control chars (\\r treated as control)', () => {
    // \r is 0x0D which is excluded from the keep-set (only \n=0x0A and \t=0x09 are kept)
    const input = 'line1\r\nline2'
    const result = sanitizeText(input)
    // \r stripped, \n preserved
    expect(result).toBe('line1\nline2')
  })
})
