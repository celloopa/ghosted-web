'use client'

import { useState, useEffect } from 'react'
import { normalizeDocStyle, type DocStyle } from '@ghosted/core'

const STORAGE_KEY = 'ghosted.docstyle.v1'

// The default accent color from the modern-cv 0.9.0 package source: rgb("#262F99")
export const DEFAULT_ACCENT_COLOR = '#262f99'

function load(): DocStyle {
  if (typeof window === 'undefined') return { template: 'modern' }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { template: 'modern' }
    return normalizeDocStyle(JSON.parse(raw))
  } catch {
    return { template: 'modern' }
  }
}

function save(style: DocStyle): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(style))
  } catch {
    // localStorage unavailable — ignore
  }
}

export function useDocStyle(): {
  style: DocStyle
  setTemplate: (t: DocStyle['template']) => void
  setFont: (f: string | undefined) => void
  setAccentColor: (c: string | undefined) => void
} {
  const [style, setStyle] = useState<DocStyle>({ template: 'modern' })

  // Load from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setStyle(load())
  }, [])

  function update(next: DocStyle) {
    setStyle(next)
    save(next)
  }

  return {
    style,
    setTemplate: (t) => update(normalizeDocStyle({ ...style, template: t })),
    setFont: (f) => update(normalizeDocStyle({ ...style, font: f })),
    setAccentColor: (c) => update(normalizeDocStyle({ ...style, accentColor: c })),
  }
}
