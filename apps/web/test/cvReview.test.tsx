import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CVReview } from '../components/CVReview'
import { viewToCvJson } from '@ghosted/core'
import type { CVView } from '@ghosted/core'

const BASE_VIEW: CVView = {
  name: 'Jane Smith',
  headline: 'Software Engineer',
  summary: 'Builds things.',
  contact: {
    email: 'jane@example.com',
    phone: '+1 555 000 0000',
    location: 'Asheville, NC',
    links: [{ label: 'GitHub', url: 'https://github.com/jane' }],
  },
  work: [
    {
      company: 'Acme Corp',
      title: 'Engineer',
      start: '2020-01',
      end: 'present',
      highlights: ['Built the dashboard.', 'Led a team of 3.'],
    },
  ],
  projects: [{ name: 'ghosted', description: 'A job tracker.', url: '', highlights: [] }],
  skills: ['TypeScript', 'React'],
  education: [{ institution: 'UNC Asheville', area: 'Computer Science', studyType: 'BS', year: '2020' }],
}

function setup(onConfirm = vi.fn(), onStartOver = vi.fn()) {
  render(
    <CVReview
      initial={BASE_VIEW}
      onConfirm={onConfirm}
      onStartOver={onStartOver}
    />,
  )
  return { onConfirm, onStartOver }
}

describe('CVReview', () => {
  it('renders the initial name in the name input', () => {
    setup()
    const nameInput = screen.getByDisplayValue('Jane Smith')
    expect(nameInput).toBeTruthy()
  })

  it('editing the name updates the value passed to onConfirm via viewToCvJson', () => {
    const onConfirm = vi.fn()
    setup(onConfirm)

    const nameInput = screen.getByDisplayValue('Jane Smith')
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })

    // Confirm button should be enabled
    const confirm = screen.getByRole('button', { name: 'This looks right' })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)

    expect(onConfirm).toHaveBeenCalledOnce()
    const passedJson = onConfirm.mock.calls[0][0] as string
    const parsed = JSON.parse(passedJson) as { basics: { name: string } }
    expect(parsed.basics.name).toBe('Jane Doe')
  })

  it('editing a work bullet updates the JSON Resume highlights', () => {
    const onConfirm = vi.fn()
    setup(onConfirm)

    const bulletInput = screen.getByDisplayValue('Built the dashboard.')
    fireEvent.change(bulletInput, { target: { value: 'Rebuilt the dashboard in React.' } })

    const confirm = screen.getByRole('button', { name: 'This looks right' })
    fireEvent.click(confirm)

    const passedJson = onConfirm.mock.calls[0][0] as string
    const parsed = JSON.parse(passedJson) as { work: { highlights: string[] }[] }
    expect(parsed.work[0].highlights).toContain('Rebuilt the dashboard in React.')
  })

  it('adding a skill updates the skills list in the JSON Resume', () => {
    const onConfirm = vi.fn()
    setup(onConfirm)

    const addInput = screen.getByPlaceholderText('Add a skill…')
    fireEvent.change(addInput, { target: { value: 'Go' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const confirm = screen.getByRole('button', { name: 'This looks right' })
    fireEvent.click(confirm)

    const passedJson = onConfirm.mock.calls[0][0] as string
    const parsed = JSON.parse(passedJson) as { skills: { name: string }[] }
    expect(parsed.skills.map((s) => s.name)).toContain('Go')
  })

  it('confirm is disabled when the name is emptied', () => {
    setup()
    const nameInput = screen.getByDisplayValue('Jane Smith')
    fireEvent.change(nameInput, { target: { value: '' } })

    const confirm = screen.getByRole('button', { name: 'This looks right' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onStartOver when "Start over" is clicked', () => {
    const onStartOver = vi.fn()
    setup(vi.fn(), onStartOver)
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(onStartOver).toHaveBeenCalledOnce()
  })

  it('produced JSON from viewToCvJson round-trips correctly for a name edit', () => {
    const modified = { ...BASE_VIEW, name: 'Updated Name' }
    const json = viewToCvJson(modified)
    const parsed = JSON.parse(json) as { basics: { name: string } }
    expect(parsed.basics.name).toBe('Updated Name')
  })
})
