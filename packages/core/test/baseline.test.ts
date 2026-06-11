import { describe, it, expect } from 'vitest'
import { validateCVJson, baselineStatus, emptyBaseline, type Baseline } from '../src/index'

const VALID_CV = JSON.stringify({
  basics: {
    name: 'Cello Rondon',
    email: 'cello@cello.design',
    profiles: [
      { network: 'GitHub', url: 'https://github.com/celloopa' },
      { network: 'LinkedIn', url: 'https://linkedin.com/in/cello' },
    ],
  },
  work: [{ name: 'Asheville Dispensary', position: 'Design Engineer' }, { name: 'VegAvengers' }],
  skills: [{ name: 'TypeScript' }, { name: 'Figma' }, { name: 'Go' }],
})

describe('validateCVJson (JSON Resume, lenient but honest)', () => {
  it('accepts a valid CV and summarizes it', () => {
    const r = validateCVJson(VALID_CV)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.summary.name).toBe('Cello Rondon')
      expect(r.summary.workCount).toBe(2)
      expect(r.summary.skillCount).toBe(3)
      expect(r.summary.profiles).toHaveLength(2)
      expect(r.summary.profiles[0]).toEqual({ label: 'GitHub', url: 'https://github.com/celloopa' })
    }
  })

  it('rejects non-JSON with a typed error, never throws', () => {
    const r = validateCVJson('not json {{')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/JSON/i)
  })

  it('rejects JSON without basics.name', () => {
    for (const bad of ['[]', '"str"', '{}', '{"basics":{}}', '{"basics":{"name":""}}']) {
      const r = validateCVJson(bad)
      expect(r.ok).toBe(false)
    }
  })

  it('tolerates missing optional sections', () => {
    const r = validateCVJson('{"basics":{"name":"X"}}')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.summary.workCount).toBe(0)
      expect(r.summary.profiles).toEqual([])
    }
  })
})

describe('baselineStatus gates the apply flow honestly', () => {
  it('empty baseline: not ready, CV and targeting missing', () => {
    const s = baselineStatus(emptyBaseline())
    expect(s.ready).toBe(false)
    expect(s.missing).toContain('cv')
    expect(s.missing).toContain('role targeting')
  })

  it('CV + role targeting = ready; voice and links are recommended, not required', () => {
    const b: Baseline = {
      ...emptyBaseline(),
      cv_json: VALID_CV,
      constraints: { ...emptyBaseline().constraints, role_types_in: ['design_engineer'] },
    }
    const s = baselineStatus(b)
    expect(s.ready).toBe(true)
    expect(s.missing).toEqual([])
    expect(s.recommended).toContain('voice samples')
  })

  it('an invalid stored CV counts as missing', () => {
    const b: Baseline = { ...emptyBaseline(), cv_json: 'garbage' }
    expect(baselineStatus(b).missing).toContain('cv')
  })

  it('voice samples and links clear the recommendations', () => {
    const b: Baseline = {
      ...emptyBaseline(),
      cv_json: VALID_CV,
      voice_samples: [{ text: 'A past cover letter I would send again.' }],
      links: [{ label: 'Portfolio', url: 'https://cello.design' }],
      constraints: { ...emptyBaseline().constraints, role_types_in: ['design_engineer'] },
    }
    expect(baselineStatus(b).recommended).toEqual([])
  })
})
