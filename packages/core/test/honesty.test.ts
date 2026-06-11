import { describe, it, expect } from 'vitest'
import {
  checkRewrite,
  checkAngle,
  isSpammyStandout,
  checkDraftHonesty,
  type RewriteCheck,
  type AngleCheck,
  type HonestyReport,
} from '../src/index'

// A realistic JSON Resume haystack. Matching is done against the raw string,
// so we never need to parse it — the structure is just here for realism.
const CV = JSON.stringify({
  basics: { name: 'Cello', summary: 'Designer who codes.' },
  work: [
    {
      name: 'Asheville Dispensary',
      position: 'Design Engineer',
      highlights: [
        'Built a reusable UI component library in React and TypeScript',
        'Implemented a scalable design system in Figma used by 12 designers',
        'Reduced bundle size by 30% through code splitting',
      ],
    },
    {
      name: 'The Green Phial',
      position: 'Designer',
      highlights: ['Translated mockups into responsive front-end code with Tailwind'],
    },
  ],
  skills: [{ name: 'React' }, { name: 'TypeScript' }, { name: 'Figma' }, { name: 'Tailwind' }],
})

describe('checkRewrite — sourceFound containment', () => {
  it('finds a source that is a verbatim substring of the CV', () => {
    const r = checkRewrite(
      { source: 'Built a reusable UI component library in React and TypeScript', rewrite: 'Built a reusable UI component library in React and TypeScript' },
      CV,
    )
    expect(r.sourceFound).toBe(true)
    expect(r.ok).toBe(true)
  })

  it('finds a source despite whitespace differences (collapsed runs)', () => {
    const r = checkRewrite(
      { source: 'Built   a reusable\n  UI component library', rewrite: 'Built a reusable UI library' },
      CV,
    )
    expect(r.sourceFound).toBe(true)
  })

  it('finds a source despite smart-quote and markdown-emphasis differences', () => {
    const cv = JSON.stringify({ work: [{ highlights: ["Shipped the team's design system"] }] })
    const r = checkRewrite(
      { source: '**Shipped the team’s design system**', rewrite: "Shipped the team's design system end to end" },
      cv,
    )
    expect(r.sourceFound).toBe(true)
  })

  it('reports sourceFound=false and ok=false when the source is absent', () => {
    const r = checkRewrite(
      { source: 'Led a team of 40 engineers across three continents', rewrite: 'Led a large distributed team' },
      CV,
    )
    expect(r.sourceFound).toBe(false)
    expect(r.ok).toBe(false)
  })

  it('matches an ellipsis-truncated long source by its first 80 chars', () => {
    const longBullet =
      'Architected and shipped a multi-tenant analytics dashboard that ingested billions of clickstream events nightly and surfaced cohort retention to product teams'
    const cv = JSON.stringify({ work: [{ highlights: [longBullet] }] })
    const truncated = longBullet.slice(0, 95) + '…' // model cut it off with an ellipsis
    const r = checkRewrite({ source: truncated, rewrite: 'Shipped an analytics dashboard for product teams' }, cv)
    expect(r.sourceFound).toBe(true)
  })

  it('strips trailing "..." ellipsis on a short-enough source too', () => {
    const r = checkRewrite(
      { source: 'Implemented a scalable design system in Figma...', rewrite: 'Implemented a design system in Figma' },
      CV,
    )
    expect(r.sourceFound).toBe(true)
  })
})

describe('checkRewrite — inventedNumbers', () => {
  it('catches a fabricated "40%" that appears in neither CV nor source', () => {
    const r = checkRewrite(
      { source: 'Reduced bundle size by 30% through code splitting', rewrite: 'Reduced bundle size by 40% and improved load time' },
      CV,
    )
    expect(r.inventedNumbers).toContain('40%')
    expect(r.ok).toBe(false)
  })

  it('does not flag a number that is present in the CV', () => {
    const r = checkRewrite(
      { source: 'Reduced bundle size by 30% through code splitting', rewrite: 'Reduced bundle size by 30% via splitting' },
      CV,
    )
    expect(r.inventedNumbers).toEqual([])
  })

  it('does not flag a number that is present in the source even if absent from the CV', () => {
    const cv = JSON.stringify({ work: [{ highlights: ['Cut latency dramatically'] }] })
    const r = checkRewrite(
      { source: 'Cut latency by 250ms in the hot path', rewrite: 'Cut latency by 250ms' },
      cv,
    )
    expect(r.inventedNumbers).toEqual([])
  })

  it('normalizes comma grouping so "12,000" in CV covers "12000" in rewrite', () => {
    const cv = JSON.stringify({ work: [{ highlights: ['Served 12,000 monthly active users'] }] })
    const r = checkRewrite(
      { source: 'Served 12,000 monthly active users', rewrite: 'Served 12000 monthly active users' },
      cv,
    )
    expect(r.inventedNumbers).toEqual([])
  })
})

describe('checkRewrite — inventedTerms', () => {
  it('catches a fabricated tool name the CV never mentions', () => {
    const r = checkRewrite(
      { source: 'Implemented a scalable design system in Figma', rewrite: 'Implemented a design system on Kubernetes' },
      CV,
    )
    expect(r.inventedTerms).toContain('Kubernetes')
    expect(r.ok).toBe(false)
  })

  it('exempts a capitalized word at the start of a sentence', () => {
    // "Kubernetes" is NOT in the CV, but here it leads the second sentence, so the
    // sentence-initial exemption must spare it. If the exemption were broken, this
    // would flag — proving the rule fires.
    const r = checkRewrite(
      { source: 'Built a reusable UI component library in React and TypeScript', rewrite: 'Built a reusable component library in React. Kubernetes was never part of it.' },
      CV,
    )
    expect(r.inventedTerms).toEqual([])
  })

  it('does not flag tech terms that appear in the CV (React, TypeScript, Figma)', () => {
    const r = checkRewrite(
      { source: 'Built a reusable UI component library in React and TypeScript', rewrite: 'Shipped React and TypeScript work into Figma' },
      CV,
    )
    expect(r.inventedTerms).toEqual([])
  })

  it('produces ZERO flags for a rewrite using only CV vocabulary plus ordinary English', () => {
    const r = checkRewrite(
      {
        source: 'Built a reusable UI component library in React and TypeScript',
        rewrite: 'Designed and shipped a reusable component library in React and TypeScript for the design system.',
      },
      CV,
    )
    expect(r.inventedNumbers).toEqual([])
    expect(r.inventedTerms).toEqual([])
    expect(r.sourceFound).toBe(true)
    expect(r.ok).toBe(true)
  })
})

describe('checkAngle — evidence containment OR word-overlap', () => {
  it('passes when evidence is a verbatim CV substring', () => {
    const r = checkAngle({ evidence: 'Implemented a scalable design system in Figma' }, CV)
    expect(r.evidenceFound).toBe(true)
  })

  it('passes a paraphrase via distinctive-word overlap (>=70%)', () => {
    // Distinctive words (len>=5): scalable, design, system, component, library, reusable — all present in CV.
    const r = checkAngle(
      { evidence: 'Scalable design system experience plus a reusable component library mindset' },
      CV,
    )
    expect(r.evidenceFound).toBe(true)
  })

  it('fails when evidence is mostly novel distinctive words absent from the CV', () => {
    const r = checkAngle(
      { evidence: 'Pioneered quantum cryptography research across distributed satellite networks' },
      CV,
    )
    expect(r.evidenceFound).toBe(false)
  })

  it('never throws on garbage cvJson and treats it as plain text', () => {
    expect(() => checkAngle({ evidence: 'anything' }, 'not json at all {{{')).not.toThrow()
    const r = checkAngle({ evidence: 'plain text haystack' }, 'a plain text haystack of words')
    expect(r.evidenceFound).toBe(true)
  })
})

describe('isSpammyStandout — spam filter', () => {
  it('flags mass outreach and connection-spam patterns', () => {
    expect(isSpammyStandout({ title: 'Growth hack', action: 'Mass DM 200 recruiters on LinkedIn' })).toBe(true)
    expect(isSpammyStandout({ title: 'Automate outreach', action: 'Set up automated cold email blasts' })).toBe(true)
    expect(isSpammyStandout({ title: 'Network fast', action: 'Connect with 50 employees this week' })).toBe(true)
    expect(isSpammyStandout({ title: 'Spray and pray', action: 'Cold DM 30 hiring managers' })).toBe(true)
    expect(isSpammyStandout({ title: 'Blanket', action: 'Follow everyone on the team and DM them' })).toBe(true)
  })

  it('passes normal, thoughtful standout suggestions', () => {
    expect(isSpammyStandout({ title: 'Proof of work', action: 'Share a small case study of a redesign' })).toBe(false)
    expect(isSpammyStandout({ title: 'Engage', action: "Comment thoughtfully on the team's blog post" })).toBe(false)
    expect(isSpammyStandout({ title: 'Warm intro', action: 'Ask one former colleague for an introduction' })).toBe(false)
  })
})

describe('checkDraftHonesty — composition and flagged arithmetic', () => {
  it('handles empty arrays with zero flags', () => {
    const report = checkDraftHonesty(
      { resume_rewrites: [], opportunity_angles: [], standout_suggestions: [] },
      CV,
    )
    expect(report.rewrites).toEqual([])
    expect(report.angles).toEqual([])
    expect(report.spammyStandouts).toEqual([])
    expect(report.flagged).toBe(0)
  })

  it('sums problems across rewrites, angles, and standouts', () => {
    const report = checkDraftHonesty(
      {
        resume_rewrites: [
          // ok: source found, no inventions
          { source: 'Built a reusable UI component library in React and TypeScript', rewrite: 'Built a reusable UI component library in React and TypeScript', why: 'match' },
          // bad: invented number 40%
          { source: 'Reduced bundle size by 30% through code splitting', rewrite: 'Reduced bundle size by 40%', why: 'punchier' },
          // bad: source not in CV
          { source: 'Wrote a compiler for a toy language', rewrite: 'Wrote a compiler', why: 'depth' },
        ],
        opportunity_angles: [
          // ok
          { title: 'Systems', evidence: 'Implemented a scalable design system in Figma', use: 'Resume' },
          // bad: novel evidence
          { title: 'Space', evidence: 'Led orbital telemetry calibration for deep-space probes', use: 'Letter' },
        ],
        standout_suggestions: [
          // ok
          { title: 'Proof', evidence: '', action: 'Share a small case study', effort: 'low' } as unknown as { title: string; action: string; effort: string },
          // spammy at index 1
          { title: 'Reach', action: 'Mass DM 200 recruiters', effort: 'low' },
        ],
      },
      CV,
    )
    expect(report.rewrites).toHaveLength(3)
    expect(report.rewrites[0]?.ok).toBe(true)
    expect(report.rewrites[1]?.ok).toBe(false)
    expect(report.rewrites[2]?.ok).toBe(false)
    expect(report.angles[0]?.evidenceFound).toBe(true)
    expect(report.angles[1]?.evidenceFound).toBe(false)
    expect(report.spammyStandouts).toEqual([1])
    // 2 bad rewrites + 1 bad angle + 1 spammy = 4
    expect(report.flagged).toBe(4)
  })

  it('does not throw on garbage cvJson in full composition', () => {
    expect(() =>
      checkDraftHonesty(
        {
          resume_rewrites: [{ source: 'x', rewrite: 'y', why: 'z' }],
          opportunity_angles: [{ title: 't', evidence: 'e', use: 'u' }],
          standout_suggestions: [{ title: 't', action: 'a', effort: 'low' }],
        },
        '<<<not json>>>',
      ),
    ).not.toThrow()
  })
})
