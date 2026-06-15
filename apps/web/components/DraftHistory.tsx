'use client'

import { useState } from 'react'
import type { MaterialsSnapshot } from '@ghosted/core'
import { snapshotPreview, relativeTime } from '../lib/draftHistoryView'

export type DraftHistoryProps = {
  history: MaterialsSnapshot[]      // already newest-first
  onRestore: (snap: MaterialsSnapshot) => Promise<unknown>
  nowISO: string                    // injected for relative time (testable)
}

export function DraftHistory({ history, onRestore, nowISO }: DraftHistoryProps) {
  // Set of row indices currently showing the inline preview
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())
  // Index of the row currently in the restoring state (null = none)
  const [restoringIndex, setRestoringIndex] = useState<number | null>(null)

  if (history.length === 0) return null

  function toggleExpand(index: number) {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  async function handleRestore(snap: MaterialsSnapshot, index: number) {
    if (restoringIndex !== null) return
    setRestoringIndex(index)
    try {
      await onRestore(snap)
    } finally {
      setRestoringIndex(null)
    }
  }

  return (
    <details className="draft-history card">
      <summary className="draft-history-summary">
        Previous versions ({history.length})
      </summary>

      {history.map((snap, index) => {
        const timeLabel = relativeTime(snap.at, nowISO)
        const previewText = snapshotPreview(snap)
        const isExpanded = expandedIndices.has(index)
        const isRestoring = restoringIndex === index
        const expandContent = snap.cover_letter || snap.summary || '(empty draft)'

        return (
          <div key={snap.at + '-' + index} className="draft-history-row">
            <span className="draft-history-time mono dim small">{timeLabel}</span>
            <span className="draft-history-preview dim small">{previewText}</span>

            <div className="draft-history-actions">
              <button
                className="btn btn-small"
                aria-label={`${isExpanded ? 'Hide' : 'Preview'} version from ${timeLabel}`}
                onClick={() => toggleExpand(index)}
              >
                {isExpanded ? 'Hide' : 'Preview'}
              </button>

              <button
                className="btn btn-small"
                aria-label={isRestoring ? undefined : `Restore version from ${timeLabel}`}
                disabled={isRestoring}
                onClick={() => handleRestore(snap, index)}
              >
                {isRestoring ? 'Restoring…' : 'Restore'}
              </button>
            </div>

            {isExpanded && (
              <pre className="doc">{expandContent}</pre>
            )}
          </div>
        )
      })}
    </details>
  )
}
