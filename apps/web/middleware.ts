/**
 * Next.js middleware — invite gate.
 *
 * When GHOSTED_INVITE_CODE is set, all routes require the 'ghosted_invite'
 * cookie to equal the code.  Visitors without the cookie are redirected to
 * /unlock so they can enter the invite code.
 *
 * When GHOSTED_INVITE_CODE is unset (local dev), the gate is completely off.
 */

import { NextRequest, NextResponse } from 'next/server'
import { needsUnlock } from './lib/server/inviteGate'

export function middleware(req: NextRequest) {
  const code = process.env.GHOSTED_INVITE_CODE
  const inviteCookie = req.cookies.get('ghosted_invite')?.value
  const { pathname } = req.nextUrl

  if (needsUnlock(pathname, inviteCookie, code)) {
    const url = req.nextUrl.clone()
    url.pathname = '/unlock'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

// Run on all routes except Next.js internals.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
