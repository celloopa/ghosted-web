/**
 * Pure routing-decision function for /api/generate.
 * Extracted here so it can be unit-tested without Next.js context.
 *
 * Routing table:
 *   body.model absent           → legacy modelForAuth(auth) path
 *   body.model present, openai  → codex CLI when no openai key; else callOpenAI
 *   body.model present, codex   → runCodexCLI always
 *   body.model present, anthropic
 *     auth.method === local_cli  → runClaudeCLI
 *     auth has no key            → runClaudeCLI
 *     otherwise                  → callAnthropic (api_key or oauth_token)
 *   unknown provider             → error sentinel
 */

import type { AIAuth, AIProvider } from '@ghosted/core'

export type Runner = 'claude_cli' | 'codex_cli' | 'anthropic_api' | 'openai_api' | 'legacy' | 'error'

export interface ResolveRunnerResult {
  runner: Runner
  /** The effective model id to use — same as body.model or derived from auth for legacy. */
  model: string
  /** Human-readable error message when runner === 'error'. */
  errorMessage?: string
}

/** Allowed characters in a model id to prevent injection. */
const MODEL_ID_RE = /^[-a-zA-Z0-9./:_]{1,100}$/

const KNOWN_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'codex']

export function resolveRunner(
  bodyModel: string | undefined,
  auth: AIAuth,
  /** Provider of bodyModel — caller looks this up from the catalog. Ignored when bodyModel is absent. */
  catalogProvider: AIProvider | undefined,
  legacyModel: string,
): ResolveRunnerResult {
  // No model override → use existing modelForAuth behaviour.
  if (bodyModel === undefined || bodyModel === null || bodyModel === '') {
    return { runner: 'legacy', model: legacyModel }
  }

  // Validate model string.
  if (!MODEL_ID_RE.test(bodyModel)) {
    return { runner: 'error', model: bodyModel, errorMessage: 'model id contains invalid characters' }
  }

  // Unknown provider → reject.
  if (!catalogProvider || !KNOWN_PROVIDERS.includes(catalogProvider)) {
    return {
      runner: 'error',
      model: bodyModel,
      errorMessage: `unknown provider for model "${bodyModel}" — cannot route request`,
    }
  }

  if (catalogProvider === 'codex') {
    return { runner: 'codex_cli', model: bodyModel }
  }

  if (catalogProvider === 'openai') {
    // Route to Codex CLI when no OpenAI key is present; else call OpenAI API directly.
    const hasKey = !!(auth.key && auth.key.length >= 24)
    return { runner: hasKey ? 'openai_api' : 'codex_cli', model: bodyModel }
  }

  // anthropic provider.
  if (catalogProvider === 'anthropic') {
    if (auth.method === 'local_cli' || !auth.key) {
      return { runner: 'claude_cli', model: bodyModel }
    }
    return { runner: 'anthropic_api', model: bodyModel }
  }

  // Unreachable given the KNOWN_PROVIDERS check above, but satisfies TS.
  return { runner: 'error', model: bodyModel, errorMessage: 'unhandled provider' }
}
