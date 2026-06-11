import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { computeStats, type Application } from '@ghosted/core'
import { RepoProvider } from '../lib/useApps'
import { MemoryRepo } from '../lib/repo'
import StatsPage from '../app/stats/page'

// M4 contract: the screen matches computeStats output exactly — same
// function, no reimplementation. We assert the rendered % equals the
// computed rate for the fixture.
function de(id: string, responded: boolean): Application {
  return {
    id,
    company: id,
    position: 'DE',
    role_type: 'design_engineer',
    status: 'applied',
    date_applied: '2026-01-01',
    events: [
      { type: 'applied', date: '2026-01-01' },
      ...(responded ? [{ type: 'response' as const, date: '2026-01-05' }] : []),
    ],
  }
}

describe('stats screen renders computeStats output verbatim', () => {
  it('shows the exact computed response rate', async () => {
    const apps = [de('a', true), de('b', true), de('c', true), de('d', false), de('e', false)]
    const stats = computeStats(apps)
    const expected = Math.round((stats.byRoleType[0]!.responseRate ?? 0) * 100)
    expect(expected).toBe(60) // sanity: 3/5

    render(
      <RepoProvider repo={new MemoryRepo(apps)}>
        <StatsPage />
      </RepoProvider>,
    )
    // the group renders in all three dimensions (role/source/resume)
    expect(await screen.findAllByText(`${expected}%`)).toHaveLength(3)
    expect(screen.getAllByText(/n=5/).length).toBeGreaterThan(0)
  })

  it('low-data groups show counts, not confident percentages', async () => {
    const apps = [de('a', true), de('b', false)]
    render(
      <RepoProvider repo={new MemoryRepo(apps)}>
        <StatsPage />
      </RepoProvider>,
    )
    expect((await screen.findAllByText(/1 of 2 replied/)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/50%/)).toBeNull()
  })
})
