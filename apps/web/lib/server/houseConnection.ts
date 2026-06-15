/**
 * Server-side "house account" — the owner's Claude subscription used when
 * a visitor has no AI connection of their own.  The token is NEVER returned
 * to the browser: it stays entirely in server-side API route code.
 *
 * Env vars:
 *   GHOSTED_HOUSE_TOKEN    — sk-ant-oat… produced by `claude setup-token`
 *   GHOSTED_HOUSE_PROVIDER — default 'anthropic'
 *   GHOSTED_HOUSE_MODEL    — default 'claude-sonnet-4-6'
 */

import { validateAIAuth, type AIAuth, type AIProvider } from '@ghosted/core'

/**
 * Returns true when the auth requires a local CLI binary (claude or codex).
 * These connections cannot work on a hosted server that has no CLI installed.
 */
export function isCliBasedAuth(auth: AIAuth): boolean {
  return auth.method === 'local_cli' || auth.provider === 'codex'
}

/**
 * Build an AIAuth from the GHOSTED_HOUSE_* environment variables.
 * Returns null when GHOSTED_HOUSE_TOKEN is unset (gate is off).
 */
export function houseConnection(): AIAuth | null {
  const token = process.env.GHOSTED_HOUSE_TOKEN
  if (!token) return null

  const provider = (process.env.GHOSTED_HOUSE_PROVIDER ?? 'anthropic') as AIProvider
  const model = process.env.GHOSTED_HOUSE_MODEL ?? 'claude-sonnet-4-6'

  // Only anthropic oauth_token is supported for the house path today.
  // If someone sets a different provider we still try, but validation will
  // catch it and surface a clear error rather than silently failing.
  return {
    provider,
    method: 'oauth_token',
    key: token,
    model,
  }
}

export type ResolveResult =
  | { auth: AIAuth; usingHouse: boolean }
  | { error: string }

/**
 * Decide which AIAuth to use for this request:
 *  1. If the request supplied a valid auth, use it (usingHouse: false).
 *  2. Otherwise fall back to the house account (usingHouse: true).
 *  3. If neither is available, return { error }.
 *
 * The house token is NEVER included in the `error` branch — it only flows
 * out through the `auth` field used server-side.
 */
export function resolveConnection(requestAuth: AIAuth | undefined): ResolveResult {
  // Caller provided an auth — validate it.
  if (requestAuth) {
    const valid = validateAIAuth(requestAuth)
    if (valid.ok) {
      // CLI-based auth needs a local binary. On a hosted server that binary
      // won't exist, so if a house account is configured we use that instead.
      // With NO house account (local dev), we honour the CLI auth as-is so
      // the owner's real claude/codex CLI keeps working.
      if (isCliBasedAuth(requestAuth)) {
        const house = houseConnection()
        if (house) {
          const houseValid = validateAIAuth(house)
          if (houseValid.ok) return { auth: house, usingHouse: true }
          return { error: `House account misconfigured: ${houseValid.message}` }
        }
        // No house token — local-dev path: use the CLI auth as-is.
        return { auth: requestAuth, usingHouse: false }
      }
      return { auth: requestAuth, usingHouse: false }
    }
    // Invalid caller auth: fall through to the house account rather than
    // hard-rejecting — the house account is the point of the deployment.
  }

  // Try the house account.
  const house = houseConnection()
  if (house) {
    const valid = validateAIAuth(house)
    if (valid.ok) return { auth: house, usingHouse: true }
    // Misconfigured house token — surface a clear error.
    return { error: `House account misconfigured: ${valid.message}` }
  }

  return { error: 'no AI connection — connect one in Settings or ask the owner to configure the house account' }
}
