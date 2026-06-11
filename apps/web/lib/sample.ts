import type { Application } from '@ghosted/core'

/** Mirrors M2's "new accounts seeded with 3 sample applications". */
export function sampleApps(today: string): Application[] {
  const d = (offset: number) =>
    new Date(Date.parse(today) - offset * 86_400_000).toISOString().slice(0, 10)
  return [
    {
      id: 'sample-1',
      company: 'Somewhere Great',
      position: 'Design Engineer',
      role_type: 'design_engineer',
      status: 'applied',
      source: 'greenhouse',
      resume_version: 'v2-design-eng',
      date_applied: d(20),
      events: [{ type: 'applied', date: d(20) }],
      notes: 'Sample — 20 days of silence. Watch the badges.',
    },
    {
      id: 'sample-2',
      company: 'Replies Inc',
      position: 'Product Designer',
      role_type: 'product_designer',
      status: 'interviewing',
      source: 'referral',
      resume_version: 'v1-generalist',
      date_applied: d(12),
      events: [
        { type: 'applied', date: d(12) },
        { type: 'response', date: d(8), detail: 'Recruiter email — intro call booked' },
        { type: 'interview', date: d(3), detail: 'Intro call with hiring manager' },
      ],
      notes: 'Sample — a funnel that worked.',
    },
    {
      id: 'sample-3',
      company: 'The Void LLC',
      position: 'Brand Designer',
      role_type: 'brand_motion',
      status: 'applied',
      source: 'linkedin',
      resume_version: 'v1-generalist',
      date_applied: d(9),
      events: [{ type: 'applied', date: d(9) }],
      notes: 'Sample — due for a follow-up.',
    },
  ]
}
