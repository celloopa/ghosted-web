/**
 * postingHelpers.ts — Pure helper functions for the /api/posting route.
 * Separated from route.ts so they can be unit-tested without importing
 * Next.js server internals (NextRequest / NextResponse).
 */

/**
 * Returns true when the hostname is a known job board that blocks automated
 * fetches (Indeed, LinkedIn, Glassdoor, ZipRecruiter, etc.).  Used to craft a
 * friendlier error message that names the board so the user knows why it failed
 * and what to do instead (paste the text manually).
 */
export function isBlockedJobBoard(hostname: string): boolean {
  // Normalise: strip leading "www." so "www.indeed.com" and "indeed.com" both match.
  const h = hostname.replace(/^www\./, '').toLowerCase()
  return /^(indeed|linkedin|glassdoor|ziprecruiter|simplyhired|monster|dice|lever|greenhouse)\./.test(h)
}

export type PostingFailReason = 'blocked' | 'timeout' | 'low-text' | 'network'

/**
 * Produce a calm, actionable message when a posting fetch fails.  When the
 * hostname is a known blocking board, name it explicitly so the user
 * understands why the fetch failed rather than seeing a generic network error.
 */
export function postingFetchErrorMessage(hostname: string, reason: PostingFailReason): string {
  const board = isBlockedJobBoard(hostname)
  const boardNote = board ? ` — some boards (Indeed, LinkedIn) block automated fetches` : ''
  switch (reason) {
    case 'blocked':
      return `Couldn't read that posting automatically${boardNote}. Paste the posting text instead.`
    case 'timeout':
      return `The page took too long to respond${boardNote}. Paste the posting text instead.`
    case 'low-text':
      return `The page loaded but contained almost no text (likely JS-rendered or bot-walled)${boardNote}. Paste the posting text instead.`
    case 'network':
      return `Couldn't reach that URL${boardNote}. Paste the posting text instead.`
  }
}
