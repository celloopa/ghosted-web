import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Application } from '@ghosted/core'
import { AppRow } from '../components/AppRow'

// "Board/list with derived badges" + "recording a response clears ghost
// state without status edits" — rendered from core, no UI-side state.
const TODAY = '2026-06-11'

function app(events: Application['events']): Application {
  return {
    id: 'x',
    company: 'The Void LLC',
    position: 'Designer',
    role_type: 'other',
    status: 'applied',
    date_applied: '2026-05-01',
    events,
  }
}

describe('derived badges render from core, never from stored status', () => {
  it('shows 👻 and ⏰ for a silent application past both thresholds', () => {
    render(<AppRow app={app([{ type: 'applied', date: '2026-05-01' }])} today={TODAY} />)
    expect(screen.getByText(/ghosted/)).toBeTruthy()
    expect(screen.getByText(/follow up/)).toBeTruthy()
  })

  it('a response event clears both badges — status untouched', () => {
    render(
      <AppRow
        app={app([
          { type: 'applied', date: '2026-05-01' },
          { type: 'response', date: '2026-06-10' },
        ])}
        today={TODAY}
      />,
    )
    expect(screen.queryByText(/ghosted/)).toBeNull()
    expect(screen.queryByText(/follow up/)).toBeNull()
    expect(screen.getByText('applied')).toBeTruthy() // manual status still the quiet fact
  })
})
