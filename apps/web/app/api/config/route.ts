import { NextResponse } from 'next/server'
import { isHouseConfigured } from '../../../lib/server/houseConnection'

/**
 * GET /api/config
 *
 * Returns public client-side configuration flags.
 * No secrets are included — only derived booleans.
 *
 * { hosted: boolean } — true when a house account (Codex or Anthropic) is
 * configured, meaning a shared account is available server-side and the
 * client does not need to collect a user connection before generating.
 */
export function GET() {
  const hosted = isHouseConfigured()
  return NextResponse.json({ hosted })
}
