import { NextRequest, NextResponse } from 'next/server'
import { parsePostingHTML } from '@ghosted/core'

// Server-side fetch (job boards block browser CORS) + deterministic parse.
// No model involved.

const FETCH_TIMEOUT_MS = 20000
const MAX_BYTES = 4 * 1024 * 1024

// SSRF guard: this runs locally today, but it should never be the reason a
// hosted deploy gets popped.
const BLOCKED_HOST =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[::1\]|::1)|\.(local|internal)$|^172\.(1[6-9]|2\d|3[01])\./i

export async function POST(req: NextRequest) {
  let url: string
  try {
    const body = (await req.json()) as { url?: string }
    url = (body.url ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'that does not look like a URL' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'only http(s) URLs' }, { status: 400 })
  }
  if (BLOCKED_HOST.test(parsed.hostname)) {
    return NextResponse.json({ error: 'that host is not fetchable' }, { status: 400 })
  }

  const started = Date.now()
  try {
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `the page answered ${res.status} — paste the posting text instead` },
        { status: 502 },
      )
    }
    const html = (await res.text()).slice(0, MAX_BYTES)
    const facts = parsePostingHTML(html, parsed.toString())
    if (facts.description.length < 200) {
      return NextResponse.json(
        { error: 'the page yielded almost no text (likely JS-rendered or bot-walled) — paste the posting instead', facts },
        { status: 422 },
      )
    }
    console.log(JSON.stringify({ kind: 'posting_fetch', host: parsed.hostname, ms: Date.now() - started, chars: facts.description.length }))
    return NextResponse.json({ facts })
  } catch (e) {
    const message = e instanceof Error && e.name === 'TimeoutError' ? 'fetch timed out' : 'could not fetch that URL'
    return NextResponse.json({ error: `${message} — paste the posting text instead` }, { status: 502 })
  }
}
