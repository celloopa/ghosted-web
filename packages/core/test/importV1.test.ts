import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseV1Import } from '../src/index'

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'v1-applications.json'),
  'utf8',
)

function importedOrThrow(json: string) {
  const r = parseV1Import(json)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r
}

describe('parseV1Import maps v1 applications.json losslessly', () => {
  const result = importedOrThrow(fixture)
  const byId = new Map(result.applications.map((a) => [a.id, a]))

  it('imports every record', () => {
    expect(result.applications).toHaveLength(6)
  })

  it('maps the 8 v1 statuses onto 5 + closed_reason', () => {
    expect(byId.get('11223344')!.status).toBe('applied')          // applied → applied
    expect(byId.get('c9d0e1f2')!.status).toBe('applied')          // screening → applied (+response event)
    expect(byId.get('a1b2c3d4')!.status).toBe('interviewing')     // interview → interviewing
    expect(byId.get('e5f6a7b8')!).toMatchObject({ status: 'closed', closed_reason: 'rejected' })
    expect(byId.get('55667788')!).toMatchObject({ status: 'closed', closed_reason: 'accepted' })
    expect(byId.get('99aabbcc')!).toMatchObject({ status: 'closed', closed_reason: 'withdrawn' })
  })

  it('synthesizes events: applied from date_applied, response for screening+', () => {
    const screening = byId.get('c9d0e1f2')!
    expect(screening.events.some((e) => e.type === 'applied')).toBe(true)
    expect(screening.events.some((e) => e.type === 'response')).toBe(true)

    const stillApplied = byId.get('11223344')!
    expect(stillApplied.events.some((e) => e.type === 'response')).toBe(false)
  })

  it('maps v1 interviews[] to interview events with details', () => {
    const interviews = byId.get('a1b2c3d4')!.events.filter((e) => e.type === 'interview')
    expect(interviews).toHaveLength(2)
    expect(interviews[0]!.detail).toContain('phone')
  })

  it('is lossless: original v1 status preserved as a provenance note event', () => {
    const note = byId.get('c9d0e1f2')!.events.find((e) => e.type === 'note')
    expect(note?.detail).toContain('screening')
  })

  it('derives source from job_url and keeps facts', () => {
    const app = byId.get('a1b2c3d4')!
    expect(app.source).toBe('greenhouse')
    expect(app.salary_min).toBe(150000)
    expect(app.resume_version).toBe('resume-v2-frontend.pdf')
    expect(app.remote).toBe(true)
  })

  it('tolerates ghosted2 statuses (tracked → saved, ghosted → applied)', () => {
    const r = importedOrThrow(JSON.stringify([
      { id: 'x1', company: 'A', position: 'B', status: 'tracked', created_at: '2026-01-01T00:00:00Z' },
      { id: 'x2', company: 'C', position: 'D', status: 'ghosted', date_applied: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
    ]))
    expect(r.applications[0]!.status).toBe('saved')
    expect(r.applications[1]!.status).toBe('applied') // derived logic re-discovers the ghost
  })
})

describe('parseV1Import returns typed errors, never throws', () => {
  it('rejects non-JSON', () => {
    const r = parseV1Import('not json {{{')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/JSON/i)
  })

  it('rejects a non-array root', () => {
    const r = parseV1Import('{"hello": 1}')
    expect(r.ok).toBe(false)
  })

  it('reports per-record errors with paths for missing required fields', () => {
    const r = parseV1Import(JSON.stringify([{ id: 'ok1', company: 'A', position: 'B', status: 'applied' }, { id: 'bad' }]))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.some((e) => e.path.includes('[1]'))).toBe(true)
    }
  })

  it('never throws on hostile input', () => {
    for (const input of ['null', '42', '"str"', '[null]', '[{"status": 7}]']) {
      expect(() => parseV1Import(input)).not.toThrow()
    }
  })
})
