/**
 * Pure gate-decision logic, extracted from middleware so it can be unit-tested
 * without Next.js request context.
 *
 * Rules:
 *   - If GHOSTED_INVITE_CODE is unset → gate is OFF, never block (local dev).
 *   - Static assets (_next/*, favicon.ico, etc.) → never block.
 *   - /unlock and /api/unlock → never block (the unlock flow itself).
 *   - Otherwise: block if the 'ghosted_invite' cookie does not exactly match
 *     the env code.
 */

/** Static-asset path prefixes that are always permitted. */
const STATIC_PREFIXES = ['/_next/', '/favicon']

/** Paths (prefix-matched) that are always open — the unlock flow itself. */
const OPEN_PREFIXES = ['/unlock', '/api/unlock']

/**
 * Returns true when the request should be redirected to /unlock.
 *
 * @param pathname    e.g. '/applications' or '/_next/static/...'
 * @param inviteCookie  value of the 'ghosted_invite' cookie (or undefined)
 * @param code        value of GHOSTED_INVITE_CODE env var (or undefined)
 */
export function needsUnlock(
  pathname: string,
  inviteCookie: string | undefined,
  code: string | undefined,
): boolean {
  // Gate is globally disabled — local dev, no env var set.
  if (!code) return false

  // Static assets are always open.
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return false

  // The unlock flow itself must stay open.
  if (OPEN_PREFIXES.some((p) => pathname.startsWith(p))) return false

  // All other routes: require the cookie to match exactly.
  return inviteCookie !== code
}
