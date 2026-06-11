import type { Application } from '@ghosted/core'

/**
 * Storage port. The UI only talks to this interface — M2 swaps
 * LocalStorageRepo for a Supabase-backed implementation without touching
 * any screen.
 */
export interface ApplicationRepo {
  list(): Promise<Application[]>
  upsert(app: Application): Promise<void>
  remove(id: string): Promise<void>
  replaceAll(apps: Application[]): Promise<void>
}

const KEY = 'ghosted.applications.v1'

export class LocalStorageRepo implements ApplicationRepo {
  async list(): Promise<Application[]> {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as Application[]) : []
    } catch {
      return []
    }
  }

  async upsert(app: Application): Promise<void> {
    const apps = await this.list()
    const i = apps.findIndex((a) => a.id === app.id)
    if (i >= 0) apps[i] = app
    else apps.push(app)
    await this.replaceAll(apps)
  }

  async remove(id: string): Promise<void> {
    await this.replaceAll((await this.list()).filter((a) => a.id !== id))
  }

  async replaceAll(apps: Application[]): Promise<void> {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(KEY, JSON.stringify(apps))
  }
}

/** Test double — same contract, no browser. */
export class MemoryRepo implements ApplicationRepo {
  constructor(private apps: Application[] = []) {}
  async list() {
    return [...this.apps]
  }
  async upsert(app: Application) {
    const i = this.apps.findIndex((a) => a.id === app.id)
    if (i >= 0) this.apps[i] = app
    else this.apps.push(app)
  }
  async remove(id: string) {
    this.apps = this.apps.filter((a) => a.id !== id)
  }
  async replaceAll(apps: Application[]) {
    this.apps = [...apps]
  }
}
