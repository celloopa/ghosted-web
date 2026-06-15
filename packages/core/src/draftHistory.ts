// Pure helpers for snapshotting Materials draft content and maintaining bounded history.
// No I/O, no framework, no clock — callers pass `at` as an ISO string.

import type { Materials, MaterialsSnapshot } from './types'

/**
 * Copies the editable content fields from a Materials object into a snapshot.
 * Excludes metadata (generated_at, model, revisions, finalized_at, etc.) and history itself.
 */
export function snapshotMaterials(m: Materials, at: string): MaterialsSnapshot {
  const snap: MaterialsSnapshot = { at }
  if (m.summary !== undefined) snap.summary = m.summary
  if (m.cover_letter !== undefined) snap.cover_letter = m.cover_letter
  if (m.resume_rewrites !== undefined) snap.resume_rewrites = m.resume_rewrites
  if (m.opportunity_angles !== undefined) snap.opportunity_angles = m.opportunity_angles
  if (m.standout_suggestions !== undefined) snap.standout_suggestions = m.standout_suggestions
  return snap
}

/**
 * Returns a new Materials with the current content snapshotted and prepended to `history`.
 * History is capped at `max` entries (default 10), newest first.
 * The snapshot stored in history does NOT contain nested history.
 * Tolerates missing / undefined content fields gracefully.
 */
export function pushHistory(m: Materials, at: string, max = 10): Materials {
  const snap = snapshotMaterials(m, at)
  const prev = m.history ?? []
  const next = [snap, ...prev].slice(0, max)
  return { ...m, history: next }
}
