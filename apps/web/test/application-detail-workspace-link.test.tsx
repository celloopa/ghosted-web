import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Application } from '@ghosted/core'
import { RepoProvider } from '../lib/useApps'
import { MemoryRepo } from '../lib/repo'
import Detail from '../app/applications/[id]/page'

// The detail page must always offer a path back to the apply workspace,
// regardless of needs_materials/materials state — otherwise an application
// that was marked "already applied" (which clears needs_materials) or
// captured as already-applied in the first place becomes a dead end: no
// way to add a posting or (re)generate materials. See CHANGELOG-worthy bug:
// "once an app is created you can't edit and go back to the generate
// materials screen."

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'app-1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

// jsdom has no fetch by default in this env; DocumentsSection calls it on
// mount to look up exported PDFs. Stub it out so materials-present tests
// don't blow up.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ files: [] }), { status: 200 })),
  )
})

const BASE: Application = {
  id: 'app-1',
  company: 'Acme Corp',
  position: 'Design Engineer',
  role_type: 'design_engineer',
  status: 'applied',
  events: [{ type: 'applied', date: '2026-01-01' }],
}

function renderDetail(app: Application) {
  render(
    <RepoProvider repo={new MemoryRepo([app])}>
      <Detail />
    </RepoProvider>,
  )
}

describe('application detail page — apply workspace re-entry', () => {
  it('applied with no posting and no materials (e.g. "already applied" quick action): offers "add posting & generate materials"', async () => {
    const app: Application = { ...BASE, needs_materials: undefined, posting: undefined, materials: undefined }
    renderDetail(app)

    const link = await screen.findByRole('link', { name: /add posting & generate materials/i })
    expect(link.getAttribute('href')).toBe('/apply?id=app-1')

    // No stale "needed" wording, and no documents section without materials.
    expect(screen.queryByText(/generate materials —/i)).toBeNull()
    expect(screen.queryByText('Open materials workspace')).toBeNull()
  })

  it('posting analyzed but no materials generated yet: offers "generate materials"', async () => {
    const app: Application = {
      ...BASE,
      needs_materials: undefined,
      materials: undefined,
      posting: {
        description: 'We are looking for…',
        fit_score: 80,
        fit_notes: [],
        matched: [],
        missing: [],
        analyzed_at: '2026-01-01T00:00:00Z',
      },
    }
    renderDetail(app)

    const link = await screen.findByRole('link', { name: /^generate materials$/i })
    expect(link.getAttribute('href')).toBe('/apply?id=app-1')
    expect(screen.queryByText('Open materials workspace')).toBeNull()
  })

  it('materials already generated: Documents section offers "Open materials workspace" and the Fact-row link steps aside', async () => {
    const app: Application = {
      ...BASE,
      needs_materials: undefined,
      posting: {
        description: 'We are looking for…',
        fit_score: 80,
        fit_notes: [],
        matched: [],
        missing: [],
        analyzed_at: '2026-01-01T00:00:00Z',
      },
      materials: {
        cover_letter: 'Dear Hiring Manager…',
        generated_at: '2026-01-01T00:00:00Z',
      },
    }
    renderDetail(app)

    const link = await screen.findByRole('link', { name: 'Open materials workspace' })
    expect(link.getAttribute('href')).toBe('/apply?id=app-1')

    // Only one workspace entry point — no duplicate Fact-row link.
    expect(screen.queryByText(/add posting & generate materials/i)).toBeNull()
    expect(screen.queryByText(/^generate materials$/i)).toBeNull()
  })
})
