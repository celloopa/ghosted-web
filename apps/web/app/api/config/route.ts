import { NextResponse } from 'next/server'
import { AI_MODEL_OPTIONS } from '@ghosted/core'
import { houseConnection, isHouseConfigured } from '../../../lib/server/houseConnection'

/**
 * GET /api/config
 *
 * Returns public client-side configuration flags.
 * No secrets are included — only derived booleans and identifying strings
 * (provider + model id + a display label). The house `key`/token NEVER
 * leaves this module — only provider/model, both non-secret, are read off
 * the AIAuth built by houseConnection().
 *
 * {
 *   hosted: boolean — true when a house account (Codex or Anthropic) is
 *     configured, meaning a shared account is available server-side and the
 *     client does not need to collect a user connection before generating.
 *   house?: { provider, model, label } — present only when hosted, so the
 *     client can say whose account/model a visitor is riding without ever
 *     seeing the credential.
 * }
 */
export function GET() {
  const hosted = isHouseConfigured()
  if (!hosted) return NextResponse.json({ hosted })

  const house = houseConnection()!
  const entry = AI_MODEL_OPTIONS.find((m) => m.provider === house.provider && m.id === house.model)
  return NextResponse.json({
    hosted,
    house: {
      provider: house.provider,
      model: house.model,
      label: entry?.label ?? house.model ?? house.provider,
    },
  })
}
