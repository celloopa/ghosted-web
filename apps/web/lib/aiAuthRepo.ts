import type { AIAuth } from '@ghosted/core'

/**
 * Same port pattern as the other repos. For now the connection lives only
 * in this browser's localStorage and is sent nowhere except the provider.
 * Iteration 3 moves it server-side (encrypted per user in Payload) — the
 * agent runs on the server, so the key must too.
 */
export interface AIAuthRepo {
  load(): Promise<AIAuth | null>
  save(auth: AIAuth): Promise<void>
  clear(): Promise<void>
}

const KEY = 'ghosted.ai-auth.v1'

export class LocalStorageAIAuthRepo implements AIAuthRepo {
  async load(): Promise<AIAuth | null> {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as AIAuth) : null
    } catch {
      return null
    }
  }
  async save(auth: AIAuth): Promise<void> {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(KEY, JSON.stringify(auth))
  }
  async clear(): Promise<void> {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(KEY)
  }
}

export class MemoryAIAuthRepo implements AIAuthRepo {
  constructor(private auth: AIAuth | null = null) {}
  async load() {
    return this.auth ? { ...this.auth } : null
  }
  async save(auth: AIAuth) {
    this.auth = { ...auth }
  }
  async clear() {
    this.auth = null
  }
}
