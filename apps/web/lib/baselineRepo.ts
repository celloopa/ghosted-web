import { emptyBaseline, type Baseline } from '@ghosted/core'

/** Same port pattern as ApplicationRepo — Payload swaps in behind it (iteration 3). */
export interface BaselineRepo {
  load(): Promise<Baseline>
  save(baseline: Baseline): Promise<void>
  clear(): Promise<void>
}

const KEY = 'ghosted.baseline.v1'

export class LocalStorageBaselineRepo implements BaselineRepo {
  async load(): Promise<Baseline> {
    if (typeof window === 'undefined') return emptyBaseline()
    try {
      const raw = window.localStorage.getItem(KEY)
      return raw ? { ...emptyBaseline(), ...(JSON.parse(raw) as Baseline) } : emptyBaseline()
    } catch {
      return emptyBaseline()
    }
  }
  async save(baseline: Baseline): Promise<void> {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(KEY, JSON.stringify(baseline))
  }
  async clear(): Promise<void> {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(KEY)
  }
}

export class MemoryBaselineRepo implements BaselineRepo {
  constructor(private baseline: Baseline = emptyBaseline()) {}
  async load() {
    return { ...this.baseline }
  }
  async save(b: Baseline) {
    this.baseline = { ...b }
  }
  async clear() {
    this.baseline = emptyBaseline()
  }
}
