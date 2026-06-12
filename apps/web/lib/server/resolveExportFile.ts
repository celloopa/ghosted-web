// resolveExportFile.ts — pure helper for serving PDF exports.
// Centralised here so security rules are testable without Next.js.

import { join } from 'node:path'

const APP_ID_RE = /^[a-zA-Z0-9-]+$/
const ALLOWED_NAMES = new Set(['resume.pdf', 'cover-letter.pdf'])

/**
 * Given an appId and filename, return the absolute path to the PDF on disk.
 *
 * Throws a descriptive Error (message safe to surface as 400/403) when:
 *  - appId fails the allowlist regex (no traversal characters)
 *  - name is not one of the two whitelisted filenames
 *
 * SECURITY:
 *  - appId /^[a-zA-Z0-9-]+$/ rejects '.', '/', '%' and all other traversal chars.
 *  - name is an exact-set check — only 'resume.pdf' or 'cover-letter.pdf' pass.
 *  - The resolved path is constructed with node:path join (no string concat),
 *    but the regex on appId means join cannot escape the exports/<appId> dir.
 */
export function resolveExportFile(appId: string, name: string): string {
  if (!APP_ID_RE.test(appId)) {
    throw new Error(`invalid appId: must match [a-zA-Z0-9-]`)
  }
  if (!ALLOWED_NAMES.has(name)) {
    throw new Error(`invalid name: must be resume.pdf or cover-letter.pdf`)
  }

  // Next.js sets process.cwd() to the web app root at runtime.
  // In tests we fall back to __dirname-relative resolution so the helper stays pure.
  const webCwd = process.env.GHOSTED_WEB_CWD ?? process.cwd()
  return join(webCwd, '.ghosted-local', 'exports', appId, name)
}

/**
 * Return the export directory for a given appId.
 * Same security rules — throws on invalid appId.
 */
export function resolveExportDir(appId: string): string {
  if (!APP_ID_RE.test(appId)) {
    throw new Error(`invalid appId: must match [a-zA-Z0-9-]`)
  }
  const webCwd = process.env.GHOSTED_WEB_CWD ?? process.cwd()
  return join(webCwd, '.ghosted-local', 'exports', appId)
}

