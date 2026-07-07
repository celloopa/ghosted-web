'use client'

import { useEffect, useState } from 'react'

export interface HouseInfo {
  provider: string
  model: string
  label: string
}

interface ConfigResponse {
  hosted: boolean
  house?: HouseInfo
}

// Module-level promise so every caller shares one fetch, regardless of how
// many components call useHosted()/useHostedConfig() on the same page.
let _promise: Promise<ConfigResponse> | null = null

function fetchConfig(): Promise<ConfigResponse> {
  if (!_promise) {
    _promise = fetch('/api/config')
      .then((r) => (r.ok ? (r.json() as Promise<ConfigResponse>) : Promise.resolve<ConfigResponse>({ hosted: false })))
      .then((data) => ({ hosted: Boolean(data.hosted), ...(data.house ? { house: data.house } : {}) }))
      .catch((): ConfigResponse => ({ hosted: false }))
  }
  return _promise
}

/**
 * Returns the full /api/config payload: whether a house account is
 * configured, and (when it is) the house's provider/model/label — never a
 * secret, just enough to say whose account a visitor is riding.
 *
 * Defaults to `{ hosted: false, house: null }` while loading or on error
 * (safe: forces explicit connection rather than accidentally skipping a gate).
 */
export function useHostedConfig(): { hosted: boolean; house: HouseInfo | null } {
  const [state, setState] = useState<{ hosted: boolean; house: HouseInfo | null }>({ hosted: false, house: null })

  useEffect(() => {
    let alive = true
    void fetchConfig().then((data) => {
      if (alive) setState({ hosted: data.hosted, house: data.house ?? null })
    })
    return () => {
      alive = false
    }
  }, [])

  return state
}

/**
 * Returns true when the server has a house account configured (Codex or
 * Anthropic), meaning a shared AI account is available and user connections
 * are optional. Built on the same shared fetch as useHostedConfig() so a page
 * using both hooks still issues exactly one request.
 *
 * Defaults to false while loading or on error (safe: forces explicit connection
 * rather than accidentally skipping a gate).
 */
export function useHosted(): boolean {
  return useHostedConfig().hosted
}
