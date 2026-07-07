/**
 * Server-side "house account" — the owner's AI subscription used when a
 * visitor has no AI connection of their own.  Secrets are NEVER returned to
 * the browser: they stay entirely in server-side API route code.
 *
 * Two house paths are supported, selected by GHOSTED_HOUSE_PROVIDER:
 *
 *   - codex (GHOSTED_HOUSE_PROVIDER=codex): the owner's Codex CLI / ChatGPT
 *     subscription. Auth is a ~/.codex/auth.json file seeded into CODEX_HOME
 *     at container start (see docker-entrypoint.sh) — there is no token in
 *     the app env for this path. Enabled purely by setting the provider.
 *   - anthropic (default): the owner's Claude subscription via a
 *     `claude setup-token` oauth token, supplied through GHOSTED_HOUSE_TOKEN.
 *
 * Env vars:
 *   GHOSTED_HOUSE_PROVIDER — 'anthropic' (default) | 'codex'
 *   GHOSTED_HOUSE_TOKEN    — sk-ant-oat… produced by `claude setup-token`
 *                            (anthropic path only; ignored for codex)
 *   GHOSTED_HOUSE_MODEL    — default 'claude-sonnet-4-6' (anthropic) or
 *                            'gpt-5.5' (codex)
 */

import { validateAIAuth, AI_MODEL_OPTIONS, type AIAuth, type AIProvider } from '@ghosted/core'

/**
 * Returns true when the auth requires a local CLI binary (claude or codex).
 * These connections cannot work on a hosted server that has no CLI installed.
 */
export function isCliBasedAuth(auth: AIAuth): boolean {
  return auth.method === 'local_cli' || auth.provider === 'codex'
}

/**
 * Build an AIAuth from the GHOSTED_HOUSE_* environment variables.
 * Returns null when no house account is configured (gate is off).
 */
export function houseConnection(): AIAuth | null {
  const provider = (process.env.GHOSTED_HOUSE_PROVIDER ?? 'anthropic') as AIProvider

  if (provider === 'codex') {
    // Codex house: auth is a ~/.codex/auth.json file seeded into CODEX_HOME at
    // container start — there is no token in the app env. Enabled purely by
    // GHOSTED_HOUSE_PROVIDER=codex. Guard the model so a leftover Claude value
    // in GHOSTED_HOUSE_MODEL can't misroute to a non-codex model.
    const wanted = process.env.GHOSTED_HOUSE_MODEL
    const model = AI_MODEL_OPTIONS.some((m) => m.provider === 'codex' && m.id === wanted) ? wanted! : 'gpt-5.5'
    return { provider: 'codex', method: 'local_cli', model }
  }

  // Anthropic house (existing behavior): requires the setup-token.
  const token = process.env.GHOSTED_HOUSE_TOKEN
  if (!token) return null
  const model = process.env.GHOSTED_HOUSE_MODEL ?? 'claude-sonnet-4-6'
  return { provider, method: 'oauth_token', key: token, model }
}

/** True when any house account (Codex or Anthropic) is configured. */
export function isHouseConfigured(): boolean {
  return houseConnection() !== null
}

/**
 * True when a request would bypass the house account's daily cap by routing
 * a BYOK (bring-your-own-key) request through a server-side CLI binary. The
 * claude/codex CLIs on a hosted server are wired to the OWNER's subscription
 * — they are not a BYOK offer, so a request that did not resolve to the
 * house account has no business running through them.
 */
export function isForbiddenCliBypass(usingHouse: boolean, runner: string): boolean {
  return !usingHouse && (runner === 'codex_cli' || runner === 'claude_cli')
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
