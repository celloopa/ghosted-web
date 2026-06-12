// Unit tests for resolveExportFile — security boundary tests.
// These run in Node (vitest) without any filesystem I/O.

import { describe, it, expect } from 'vitest'
import { resolveExportFile } from '../lib/server/resolveExportFile'

describe('resolveExportFile — security', () => {
  // ── Valid inputs ─────────────────────────────────────────────────────────────

  it('returns an absolute path for a valid uuid-style appId + resume.pdf', () => {
    const result = resolveExportFile('abc123-def456', 'resume.pdf')
    expect(result).toContain('abc123-def456')
    expect(result).toContain('resume.pdf')
    expect(result.startsWith('/')).toBe(true)
  })

  it('returns an absolute path for a valid appId + cover-letter.pdf', () => {
    const result = resolveExportFile('my-app-id', 'cover-letter.pdf')
    expect(result).toContain('my-app-id')
    expect(result).toContain('cover-letter.pdf')
  })

  it('includes .ghosted-local/exports in the resolved path', () => {
    const result = resolveExportFile('app-1', 'resume.pdf')
    expect(result).toContain('.ghosted-local')
    expect(result).toContain('exports')
  })

  it('accepts appIds with uppercase letters', () => {
    expect(() => resolveExportFile('AppID-ABC123', 'resume.pdf')).not.toThrow()
  })

  it('accepts alphanumeric-only appId', () => {
    expect(() => resolveExportFile('abc123', 'cover-letter.pdf')).not.toThrow()
  })

  // ── Traversal / injection attacks on appId ───────────────────────────────────

  it('rejects appId containing ".."', () => {
    expect(() => resolveExportFile('../etc', 'resume.pdf')).toThrow(/invalid appId/)
  })

  it('rejects appId containing a forward slash', () => {
    expect(() => resolveExportFile('foo/bar', 'resume.pdf')).toThrow(/invalid appId/)
  })

  it('rejects appId containing a percent-encoded dot (%2e)', () => {
    expect(() => resolveExportFile('%2e%2e', 'resume.pdf')).toThrow(/invalid appId/)
  })

  it('rejects appId containing a backslash', () => {
    expect(() => resolveExportFile('foo\\bar', 'resume.pdf')).toThrow(/invalid appId/)
  })

  it('rejects an empty appId', () => {
    expect(() => resolveExportFile('', 'resume.pdf')).toThrow(/invalid appId/)
  })

  it('rejects appId with a null byte', () => {
    expect(() => resolveExportFile('foo\0bar', 'resume.pdf')).toThrow(/invalid appId/)
  })

  // ── Name allowlist ───────────────────────────────────────────────────────────

  it('rejects a name not in the allowlist (e.g. "../../etc/passwd")', () => {
    expect(() => resolveExportFile('valid-id', '../../etc/passwd')).toThrow(/invalid name/)
  })

  it('rejects a name not in the allowlist (e.g. "hack.pdf")', () => {
    expect(() => resolveExportFile('valid-id', 'hack.pdf')).toThrow(/invalid name/)
  })

  it('rejects a name that is "resume.pdf" with leading path segment', () => {
    expect(() => resolveExportFile('valid-id', '../resume.pdf')).toThrow(/invalid name/)
  })

  it('rejects an empty name', () => {
    expect(() => resolveExportFile('valid-id', '')).toThrow(/invalid name/)
  })

  it('rejects a name that is exactly ".."', () => {
    expect(() => resolveExportFile('valid-id', '..')).toThrow(/invalid name/)
  })

  it('rejects a URL-encoded slash in name (%2f)', () => {
    expect(() => resolveExportFile('valid-id', '%2fresume.pdf')).toThrow(/invalid name/)
  })
})
