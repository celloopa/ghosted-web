/**
 * POST /api/unlock — validate the invite code and set the 'ghosted_invite' cookie.
 *
 * Body: { code: string }
 * Success: 200, sets cookie 'ghosted_invite' (httpOnly, sameSite lax, 30d)
 * Failure: 401 { error: 'That code did not match.' }
 */

import { NextRequest, NextResponse } from 'next/server'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days in seconds

export async function POST(req: NextRequest) {
  let body: { code?: string }
  try {
    body = (await req.json()) as { code?: string }
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  const expected = process.env.GHOSTED_INVITE_CODE
  if (!expected) {
    // Invite gate is off — any code passes (or this endpoint should never
    // be called, but handle gracefully just in case).
    const res = NextResponse.json({ ok: true })
    return res
  }

  const provided = (body.code ?? '').trim()
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'That code did not match.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('ghosted_invite', expected, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
  return res
}
