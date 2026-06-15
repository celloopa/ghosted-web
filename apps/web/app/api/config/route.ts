import { NextResponse } from 'next/server'

/**
 * GET /api/config
 *
 * Returns public client-side configuration flags.
 * No secrets are included — only derived booleans.
 *
 * { hosted: boolean } — true when GHOSTED_HOUSE_TOKEN is set, meaning a
 * shared account is available server-side and the client does not need to
 * collect a user connection before generating.
 */
export function GET() {
  const hosted = Boolean(process.env.GHOSTED_HOUSE_TOKEN)
  return NextResponse.json({ hosted })
}
