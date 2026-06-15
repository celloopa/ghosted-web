'use client'

import { useEffect, useState } from 'react'

// Module-level promise so every caller shares one fetch, regardless of how
// many components call useHosted() on the same page.
let _promise: Promise<boolean> | null = null

function fetchHosted(): Promise<boolean> {
  if (!_promise) {
    _promise = fetch('/api/config')
      .then((r) => (r.ok ? (r.json() as Promise<{ hosted?: boolean }>) : { hosted: false }))
      .then((data) => Boolean((data as { hosted?: boolean }).hosted))
      .catch(() => false)
  }
  return _promise
}

/**
 * Returns true when the server has a GHOSTED_HOUSE_TOKEN configured,
 * meaning a shared AI account is available and user connections are optional.
 *
 * Defaults to false while loading or on error (safe: forces explicit connection
 * rather than accidentally skipping a gate).
 */
export function useHosted(): boolean {
  const [hosted, setHosted] = useState(false)

  useEffect(() => {
    let alive = true
    void fetchHosted().then((v) => {
      if (alive) setHosted(v)
    })
    return () => {
      alive = false
    }
  }, [])

  return hosted
}
