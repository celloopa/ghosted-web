import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Application } from '@ghosted/core'
import { EditApplicationForm } from '../components/EditApplicationForm'

/** A fully-populated application fixture. */
const BASE_APP: Application = {
  id: 'test-id-1',
  company: 'Figma',
  position: 'Design Engineer',
  role_type: 'design_engineer',
  status: 'applied',
  date_applied: '2024-03-01',
  salary_min: 150000,
  salary_max: 200000,
  location: 'San Francisco, CA',
  remote: true,
  job_url: 'https://boards.greenhouse.io/figma/jobs/1',
  resume_version: 'v2-design-eng',
  notes: 'Great team, good comp.',
  source: 'greenhouse',
  events: [
    { type: 'applied', date: '2024-03-01' },
    { type: 'response', date: '2024-03-10', detail: 'Recruiter reached out' },
  ],
  materials: {
    cover_letter: 'Dear Hiring Manager…',
    generated_at: '2024-03-01T12:00:00Z',
  },
  posting: {
    url: 'https://boards.greenhouse.io/figma/jobs/1',
    description: 'We are looking for…',
    fit_score: 0.85,
    fit_notes: ['Strong match'],
    matched: ['React', 'TypeScript'],
    missing: ['Figma API'],
    analyzed_at: '2024-03-01T12:00:00Z',
  },
  needs_materials: false,
  remind_at: undefined,
}

describe('EditApplicationForm', () => {
  it('prefills all fields from the app prop', () => {
    render(<EditApplicationForm app={BASE_APP} onSave={vi.fn()} onCancel={vi.fn()} />)

    expect((screen.getByPlaceholderText('Company name') as HTMLInputElement).value).toBe('Figma')
    expect((screen.getByPlaceholderText('Job title') as HTMLInputElement).value).toBe('Design Engineer')
    expect((screen.getByPlaceholderText('City, State or Remote') as HTMLInputElement).value).toBe('San Francisco, CA')
    expect((screen.getByPlaceholderText('https://…') as HTMLInputElement).value).toBe(
      'https://boards.greenhouse.io/figma/jobs/1'
    )
    expect((screen.getByPlaceholderText('e.g. v2-design-eng') as HTMLInputElement).value).toBe('v2-design-eng')
    expect((screen.getByDisplayValue('Great team, good comp.') as HTMLTextAreaElement).value).toBe(
      'Great team, good comp.'
    )

    // salary pre-fills
    expect((screen.getByPlaceholderText('150000') as HTMLInputElement).value).toBe('150000')
    expect((screen.getByPlaceholderText('200000') as HTMLInputElement).value).toBe('200000')

    // Design Engineer chip should be selected
    const deChip = screen.getByRole('button', { name: 'Design Engineer' })
    expect(deChip.className).toContain('chip-selected')

    // Remote chip should be selected
    const remoteChip = screen.getByRole('button', { name: 'Remote' })
    expect(remoteChip.className).toContain('chip-selected')
  })

  it('blocks save when company is empty and shows an alert; onSave is not called', async () => {
    const onSave = vi.fn()
    render(<EditApplicationForm app={BASE_APP} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('Company name'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/company is required/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('blocks save when position is empty and shows an alert; onSave is not called', async () => {
    const onSave = vi.fn()
    render(<EditApplicationForm app={BASE_APP} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('Job title'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/position is required/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saved object preserves untouched fields (events, materials, status, posting) and updates edited ones', async () => {
    let saved: Application | undefined
    render(
      <EditApplicationForm
        app={BASE_APP}
        onSave={(app) => { saved = app }}
        onCancel={vi.fn()}
      />
    )

    // Change company only
    fireEvent.change(screen.getByPlaceholderText('Company name'), { target: { value: 'Notion' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(saved).toBeDefined())

    // Updated field
    expect(saved!.company).toBe('Notion')

    // Preserved fields that must NOT change
    expect(saved!.status).toBe(BASE_APP.status)
    expect(saved!.events).toEqual(BASE_APP.events)
    expect(saved!.materials).toEqual(BASE_APP.materials)
    expect(saved!.posting).toEqual(BASE_APP.posting)
    expect(saved!.date_applied).toBe(BASE_APP.date_applied)
    expect(saved!.source).toBe(BASE_APP.source)
    expect(saved!.id).toBe(BASE_APP.id)
  })

  it('blank salary inputs yield undefined (not 0 or NaN); filled salary parses to number', async () => {
    let saved: Application | undefined

    // Test blank salary
    const appNoSalary: Application = { ...BASE_APP, salary_min: undefined, salary_max: undefined }
    const { unmount } = render(
      <EditApplicationForm
        app={appNoSalary}
        onSave={(app) => { saved = app }}
        onCancel={vi.fn()}
      />
    )

    // Both salary fields start blank — submit directly
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(saved).toBeDefined())

    expect(saved!.salary_min).toBeUndefined()
    expect(saved!.salary_max).toBeUndefined()
    unmount()

    // Now test filled salary
    saved = undefined
    render(
      <EditApplicationForm
        app={appNoSalary}
        onSave={(app) => { saved = app }}
        onCancel={vi.fn()}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('150000'), { target: { value: '180000' } })
    fireEvent.change(screen.getByPlaceholderText('200000'), { target: { value: '220000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(saved).toBeDefined())
    expect(saved!.salary_min).toBe(180000)
    expect(saved!.salary_max).toBe(220000)
    expect(typeof saved!.salary_min).toBe('number')
    expect(typeof saved!.salary_max).toBe('number')
  })

  it('cancel calls onCancel without calling onSave', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<EditApplicationForm app={BASE_APP} onSave={onSave} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('blank optional text inputs remove the field from the saved object', async () => {
    let saved: Application | undefined
    render(
      <EditApplicationForm
        app={BASE_APP}
        onSave={(app) => { saved = app }}
        onCancel={vi.fn()}
      />
    )

    // Clear location, job_url, resume_version, notes
    fireEvent.change(screen.getByPlaceholderText('City, State or Remote'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('https://…'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. v2-design-eng'), { target: { value: '' } })
    fireEvent.change(screen.getByDisplayValue('Great team, good comp.'), { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(saved).toBeDefined())

    expect(saved!.location).toBeUndefined()
    expect(saved!.job_url).toBeUndefined()
    expect(saved!.resume_version).toBeUndefined()
    expect(saved!.notes).toBeUndefined()
  })
})
