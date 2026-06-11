import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Application } from '@ghosted/core'
import { CaptureForm } from '../components/CaptureForm'

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByPlaceholderText(label), { target: { value } })
}

describe('CaptureForm (M3: one form, ≤7 fields, role_type required)', () => {
  it('blocks submit without company/position/role_type', async () => {
    const onSubmit = vi.fn()
    render(<CaptureForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add application' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks submit until an intent is picked', async () => {
    const onSubmit = vi.fn()
    render(<CaptureForm onSubmit={onSubmit} />)
    fill(/hopes up/i, 'Figma')
    fill(/job title/i, 'Design Engineer')
    fireEvent.click(screen.getByRole('button', { name: /Design Engineer.*creative technologist/s }))
    fireEvent.click(screen.getByRole('button', { name: 'Add application' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/what happens next/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits a valid application with an applied event and derived source', async () => {
    let captured: Application | undefined
    render(
      <CaptureForm
        onSubmit={(app) => {
          captured = app
        }}
      />,
    )
    fill(/hopes up/i, 'Figma')
    fill(/job title/i, 'Design Engineer')
    fireEvent.click(screen.getByRole('button', { name: /Design Engineer.*creative technologist/s }))
    fireEvent.click(screen.getByRole('button', { name: /Applying now — I have my materials/ }))
    fill(/https/i, 'https://boards.greenhouse.io/figma/jobs/1')
    fireEvent.click(screen.getByRole('button', { name: 'Add application' }))

    await waitFor(() => expect(captured).toBeDefined())
    expect(captured).toMatchObject({
      company: 'Figma',
      position: 'Design Engineer',
      role_type: 'design_engineer',
      status: 'applied',
      source: 'greenhouse',
    })
    expect(captured!.events.some((e) => e.type === 'applied')).toBe(true)
    expect(captured!.date_applied).toBeTruthy()
  })

  it('"just saving it" creates a saved application with no events', async () => {
    let captured: Application | undefined
    render(
      <CaptureForm
        onSubmit={(app) => {
          captured = app
        }}
      />,
    )
    fill(/hopes up/i, 'Acme')
    fill(/job title/i, 'Designer')
    fireEvent.click(screen.getByRole('button', { name: /Product Designer/s }))
    fireEvent.click(screen.getByRole('button', { name: /Just saving it/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add application' }))

    await waitFor(() => expect(captured).toBeDefined())
    expect(captured!.status).toBe('saved')
    expect(captured!.events).toHaveLength(0)
    expect(captured!.date_applied).toBeUndefined()
  })

  it('"I need materials" queues it: saved + needs_materials', async () => {
    let captured: Application | undefined
    render(
      <CaptureForm
        onSubmit={(app) => {
          captured = app
        }}
      />,
    )
    fill(/hopes up/i, 'Figma')
    fill(/job title/i, 'Design Engineer')
    fireEvent.click(screen.getByRole('button', { name: /Brand \/ Motion/s }))
    fireEvent.click(screen.getByRole('button', { name: /I need materials/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to materials' }))

    await waitFor(() => expect(captured).toBeDefined())
    expect(captured!).toMatchObject({ status: 'saved', needs_materials: true })
  })

  it('"Remind me" stores a remind date on a saved application', async () => {
    let captured: Application | undefined
    render(
      <CaptureForm
        onSubmit={(app) => {
          captured = app
        }}
      />,
    )
    fill(/hopes up/i, 'Acme')
    fill(/job title/i, 'Designer')
    fireEvent.click(screen.getByRole('button', { name: /Product Designer/s }))
    fireEvent.click(screen.getByRole('button', { name: /Remind me/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add application' }))

    await waitFor(() => expect(captured).toBeDefined())
    expect(captured!.status).toBe('saved')
    expect(captured!.remind_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
