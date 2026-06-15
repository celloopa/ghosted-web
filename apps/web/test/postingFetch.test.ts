// Unit tests for posting-fetch helpers and typst error surfacing.
// These are pure functions — no network, no child processes.
import { describe, it, expect } from 'vitest'
import { isBlockedJobBoard, postingFetchErrorMessage } from '../lib/server/postingHelpers'
import { stderrTail } from '../lib/server/typstExport'

// ── isBlockedJobBoard ─────────────────────────────────────────────────────────

describe('isBlockedJobBoard', () => {
  it('identifies indeed.com as a blocked board', () => {
    expect(isBlockedJobBoard('indeed.com')).toBe(true)
  })

  it('identifies www.indeed.com as a blocked board (strips www prefix)', () => {
    expect(isBlockedJobBoard('www.indeed.com')).toBe(true)
  })

  it('identifies linkedin.com as a blocked board', () => {
    expect(isBlockedJobBoard('linkedin.com')).toBe(true)
  })

  it('identifies glassdoor.com as a blocked board', () => {
    expect(isBlockedJobBoard('glassdoor.com')).toBe(true)
  })

  it('identifies ziprecruiter.com as a blocked board', () => {
    expect(isBlockedJobBoard('ziprecruiter.com')).toBe(true)
  })

  it('returns false for a regular company careers page', () => {
    expect(isBlockedJobBoard('stripe.com')).toBe(false)
  })

  it('returns false for github.com', () => {
    expect(isBlockedJobBoard('github.com')).toBe(false)
  })

  it('returns false for an unrelated domain', () => {
    expect(isBlockedJobBoard('example.com')).toBe(false)
  })
})

// ── postingFetchErrorMessage ──────────────────────────────────────────────────

describe('postingFetchErrorMessage', () => {
  it('mentions Indeed and LinkedIn when host is a known blocked board', () => {
    const msg = postingFetchErrorMessage('indeed.com', 'blocked')
    expect(msg).toMatch(/Indeed/)
    expect(msg).toMatch(/LinkedIn/)
  })

  it('tells the user to paste the posting text in the blocked case', () => {
    const msg = postingFetchErrorMessage('indeed.com', 'blocked')
    expect(msg.toLowerCase()).toMatch(/paste/)
  })

  it('produces a sensible message for a timeout on a non-board host', () => {
    const msg = postingFetchErrorMessage('stripe.com', 'timeout')
    expect(msg.toLowerCase()).toMatch(/too long|timeout/)
    // Non-board hosts should NOT mention Indeed/LinkedIn
    expect(msg).not.toMatch(/Indeed/)
  })

  it('produces a sensible message for low-text (JS-walled) on linkedin.com', () => {
    const msg = postingFetchErrorMessage('www.linkedin.com', 'low-text')
    expect(msg.toLowerCase()).toMatch(/paste/)
    expect(msg).toMatch(/Indeed|LinkedIn|bot-walled/)
  })

  it('produces a network-error message that guides the user to paste', () => {
    const msg = postingFetchErrorMessage('boards.greenhouse.io', 'network')
    expect(msg.toLowerCase()).toMatch(/paste/)
  })

  it('returned messages never contain an Error class prefix or stack-trace line prefix', () => {
    for (const reason of ['blocked', 'timeout', 'low-text', 'network'] as const) {
      const msg = postingFetchErrorMessage('indeed.com', reason)
      // No "Error:" prefix (class-name preamble from thrown errors)
      expect(msg).not.toMatch(/^Error:/)
      // No Node.js stack-trace line format ("    at Foo.bar")
      expect(msg).not.toMatch(/^\s+at /m)
    }
  })
})

// ── stderrTail ────────────────────────────────────────────────────────────────

describe('stderrTail', () => {
  it('returns the full string when it is under the cap', () => {
    const err = Object.assign(new Error('short'), { stderr: 'error: file not found' })
    expect(stderrTail(err)).toBe('error: file not found')
  })

  it('returns the last 400 chars when stderr exceeds the cap', () => {
    const long = 'x'.repeat(300) + 'error: package not found'
    const err = Object.assign(new Error('ignored'), { stderr: long })
    const result = stderrTail(err)
    expect(result.endsWith('error: package not found')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(400)
  })

  it('falls back to err.message when stderr is absent', () => {
    const err = new Error('typst: command not found') as Error & { stderr?: string }
    expect(stderrTail(err)).toContain('typst: command not found')
  })

  it('respects a custom maxLen parameter', () => {
    const long = 'a'.repeat(200) + 'END'
    const err = Object.assign(new Error('ignored'), { stderr: long })
    const result = stderrTail(err, 50)
    expect(result.length).toBeLessThanOrEqual(50)
    expect(result).toContain('END')
  })

  it('returns empty string when both stderr and message are empty', () => {
    const err = Object.assign(new Error(''), { stderr: '' })
    expect(stderrTail(err)).toBe('')
  })
})
