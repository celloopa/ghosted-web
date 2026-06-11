import type { Application, ApplicationEvent } from '../src/types'

let n = 0

export function makeApp(overrides: Partial<Application> = {}): Application {
  n += 1
  return {
    id: `app-${n}`,
    company: 'Acme',
    position: 'Design Engineer',
    role_type: 'design_engineer',
    status: 'applied',
    date_applied: '2026-01-01',
    events: [{ type: 'applied', date: '2026-01-01' }],
    ...overrides,
  }
}

export function ev(type: ApplicationEvent['type'], date: string, extra: Partial<ApplicationEvent> = {}): ApplicationEvent {
  return { type, date, ...extra }
}
