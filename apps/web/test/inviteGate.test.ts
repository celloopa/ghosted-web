/**
 * Unit tests for needsUnlock (invite gate pure logic).
 */

import { describe, it, expect } from 'vitest'
import { needsUnlock } from '../lib/server/inviteGate'

const CODE = 'secret-invite-42'

describe('needsUnlock', () => {
  it('returns false when no invite code is set (gate is off)', () => {
    expect(needsUnlock('/applications', undefined, undefined)).toBe(false)
    expect(needsUnlock('/applications', 'wrong', undefined)).toBe(false)
    expect(needsUnlock('/settings', 'anything', '')).toBe(false)
  })

  it('never blocks _next/* static assets', () => {
    expect(needsUnlock('/_next/static/chunks/app.js', undefined, CODE)).toBe(false)
    expect(needsUnlock('/_next/image?url=x', 'wrong', CODE)).toBe(false)
  })

  it('never blocks /unlock (the unlock page itself)', () => {
    expect(needsUnlock('/unlock', undefined, CODE)).toBe(false)
    expect(needsUnlock('/unlock', 'wrong', CODE)).toBe(false)
  })

  it('never blocks /api/unlock (the unlock API)', () => {
    expect(needsUnlock('/api/unlock', undefined, CODE)).toBe(false)
    expect(needsUnlock('/api/unlock', 'wrong', CODE)).toBe(false)
  })

  it('blocks when the invite cookie is wrong', () => {
    expect(needsUnlock('/applications', 'not-the-code', CODE)).toBe(true)
    expect(needsUnlock('/', undefined, CODE)).toBe(true)
  })

  it('passes when the invite cookie exactly matches', () => {
    expect(needsUnlock('/applications', CODE, CODE)).toBe(false)
    expect(needsUnlock('/settings', CODE, CODE)).toBe(false)
    expect(needsUnlock('/', CODE, CODE)).toBe(false)
  })

  it('blocks /api routes other than /api/unlock', () => {
    expect(needsUnlock('/api/generate', undefined, CODE)).toBe(true)
    expect(needsUnlock('/api/generate', 'wrong', CODE)).toBe(true)
    expect(needsUnlock('/api/generate', CODE, CODE)).toBe(false)
  })

  it('does not treat /favicon.ico as blocked', () => {
    expect(needsUnlock('/favicon.ico', undefined, CODE)).toBe(false)
  })
})
