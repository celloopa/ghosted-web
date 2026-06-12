/**
 * pickerModels.ts — pure helper for the ModelPicker component.
 *
 * Filters a raw catalog down to the entries that should be shown in the <select>:
 *   1. Hide entries that are not runnable with the current connections (no "(unavailable)" options).
 *   2. Deduplicate by normalized model id + provider group:
 *      - Prefer the runnable entry over a non-runnable one.
 *      - Among runnable duplicates prefer source !== 'openrouter' (fallback catalog has curated pricing).
 *      - Deduplicate also by normalized display label within a provider group.
 *        Normalization strips a leading provider prefix (e.g. "Anthropic: "), lowercases,
 *        strips non-alphanumerics (so "4.6" == "4-6"), and collapses whitespace.
 *        An entry is a duplicate if EITHER its normalized id OR its normalized label
 *        collides with an already-seen entry in the same provider group.
 *   3. Sort within each group: stable by modelClass order (small < standard < deep), then by label.
 *
 * Returns { claudeEntries, openaiEntries } ready for rendering, plus a
 * convenience `allEmpty` flag.
 */

import type { ModelCatalogEntry, RunnableOpts } from '@ghosted/core'
import { runnableWith } from '@ghosted/core'

/** Canonical provider group — 'anthropic' or 'openai' (codex is openai for display). */
export type PickerGroup = 'anthropic' | 'openai'

/** An entry ready for rendering in a <option>. Always runnable. */
export interface PickerEntry {
  key: string
  id: string
  label: string
  group: PickerGroup
}

const MODEL_CLASS_ORDER: Record<string, number> = { small: 0, standard: 1, deep: 2 }

function classOrder(entry: ModelCatalogEntry): number {
  return MODEL_CLASS_ORDER[entry.modelClass] ?? 1
}

function pickerGroup(entry: ModelCatalogEntry): PickerGroup {
  return entry.provider === 'anthropic' ? 'anthropic' : 'openai'
}

/**
 * A composite key for deduplication: group + model-id.
 * codex and openai entries with the same id are treated as the same model.
 */
function dedupeKey(entry: ModelCatalogEntry): string {
  return `${pickerGroup(entry)}:${entry.id}`
}

/**
 * Leading provider prefixes in two styles:
 *   - Label style:  "Anthropic: Claude …"  (colon + space)
 *   - Id style:     "anthropic/claude-…"   (slash — OpenRouter format)
 */
const PROVIDER_PREFIX_RE = /^(anthropic|openai|google|meta|x-?ai)[:/]\s*/i

/**
 * Normalize a string for cross-source identity comparison.
 *   - Strip a leading provider prefix in label style ("Anthropic: ") or id style ("anthropic/")
 *   - Lowercase
 *   - Remove every non-alphanumeric character (so "4.6" == "4-6" == "46")
 *   - Collapse runs of whitespace (shouldn't survive after stripping, but be safe)
 */
function normalizeIdentity(s: string): string {
  return s
    .replace(PROVIDER_PREFIX_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Normalized id key: group + stripped/lowercased/alphanumeric-only id.
 * Matches "anthropic/claude-sonnet-4.6" with "claude-sonnet-4-6".
 */
function normalizedIdKey(entry: ModelCatalogEntry): string {
  return `${pickerGroup(entry)}:id:${normalizeIdentity(entry.id)}`
}

/**
 * Normalized label key: group + stripped/lowercased/alphanumeric-only label.
 * Matches "Anthropic: Claude Sonnet 4.6" with "Claude Sonnet 4.6".
 */
function normalizedLabelKey(entry: ModelCatalogEntry): string {
  return `${pickerGroup(entry)}:label:${normalizeIdentity(entry.label)}`
}

/**
 * Score a catalog entry for deduplication preference (higher = preferred).
 *   - runnable beats non-runnable: +2
 *   - non-openrouter source beats openrouter: +1 (curated fallback catalog)
 */
function preferenceScore(entry: ModelCatalogEntry, opts: RunnableOpts): number {
  let score = 0
  if (runnableWith(entry, opts)) score += 2
  if (entry.source !== 'openrouter') score += 1
  return score
}

/**
 * Filter, deduplicate, and sort a catalog for the model picker.
 *
 * @param catalog  The merged catalog (fallback + API response).
 * @param opts     Current connection availability.
 * @returns        Arrays of PickerEntry for claude and openai groups, plus flags.
 */
export function buildPickerEntries(
  catalog: ModelCatalogEntry[],
  opts: RunnableOpts,
): { claudeEntries: PickerEntry[]; openaiEntries: PickerEntry[] } {
  // Step 1: Collect the best-scored entry for each exact dedup key (group:id).
  //         This handles the simple case where id and provider are identical.
  const bestByExactKey = new Map<string, ModelCatalogEntry>()
  for (const entry of catalog) {
    const key = dedupeKey(entry)
    const current = bestByExactKey.get(key)
    if (!current || preferenceScore(entry, opts) > preferenceScore(current, opts)) {
      bestByExactKey.set(key, entry)
    }
  }

  // Step 2: Keep only runnable entries.
  const runnable = [...bestByExactKey.values()].filter((e) => runnableWith(e, opts))

  // Step 3: Deduplicate by normalized identity within each provider group.
  //         An entry is a duplicate if its normalized id OR its normalized label
  //         has already been seen (within the same group).
  //         When two entries collide on a normalized key the one with the higher
  //         preference score wins; on a tie the first encountered wins
  //         (runnable entries have already been sorted above so order is stable).
  //
  //         This handles cross-source pairs such as:
  //           "anthropic/claude-sonnet-4.6" (OpenRouter) vs "claude-sonnet-4-6" (fallback)
  //           "Anthropic: Claude Sonnet 4.6" (OpenRouter) vs "Claude Sonnet 4.6" (fallback)
  const seenNormId = new Map<string, ModelCatalogEntry>()
  const seenNormLabel = new Map<string, ModelCatalogEntry>()

  // First pass: decide the winner for each normalized key collision.
  // We iterate runnable (already preference-scored) and for each normalized key
  // keep the highest-scored entry.
  for (const entry of runnable) {
    const nid = normalizedIdKey(entry)
    const nlabel = normalizedLabelKey(entry)
    const score = preferenceScore(entry, opts)

    const existingById = seenNormId.get(nid)
    if (!existingById || score > preferenceScore(existingById, opts)) {
      seenNormId.set(nid, entry)
    }

    const existingByLabel = seenNormLabel.get(nlabel)
    if (!existingByLabel || score > preferenceScore(existingByLabel, opts)) {
      seenNormLabel.set(nlabel, entry)
    }
  }

  // Second pass: an entry survives only if it IS the winner on both its
  // normalized-id slot AND its normalized-label slot.
  // This prevents a lower-scored entry from sneaking through on a different
  // normalized key while its true duplicate already won a slot.
  const deduped: ModelCatalogEntry[] = []
  const addedEntries = new Set<ModelCatalogEntry>()
  for (const entry of runnable) {
    const winnerById = seenNormId.get(normalizedIdKey(entry))
    const winnerByLabel = seenNormLabel.get(normalizedLabelKey(entry))
    // Survive only if this entry is the winner on at least one key,
    // AND has not already been added (e.g. as the winner of the other key).
    const isWinner = winnerById === entry || winnerByLabel === entry
    if (isWinner && !addedEntries.has(entry)) {
      // But also skip it if a conflicting winner was already added —
      // i.e. this entry lost on the OTHER key to someone already in deduped.
      const conflictsById = winnerById !== entry && winnerById !== undefined && addedEntries.has(winnerById)
      const conflictsByLabel = winnerByLabel !== entry && winnerByLabel !== undefined && addedEntries.has(winnerByLabel)
      if (!conflictsById && !conflictsByLabel) {
        deduped.push(entry)
        addedEntries.add(entry)
      }
    }
  }

  // Step 4 (unchanged): Sort within group by class then label.
  deduped.sort((a, b) => {
    const gA = pickerGroup(a)
    const gB = pickerGroup(b)
    if (gA !== gB) return gA.localeCompare(gB)
    const classA = classOrder(a)
    const classB = classOrder(b)
    if (classA !== classB) return classA - classB
    return a.label.localeCompare(b.label)
  })

  // Step 5 (unchanged): Split into groups and convert to PickerEntry.
  const claudeEntries: PickerEntry[] = []
  const openaiEntries: PickerEntry[] = []

  for (const entry of deduped) {
    const pe: PickerEntry = {
      key: `${entry.provider}:${entry.id}`,
      id: entry.id,
      label: entry.label,
      group: pickerGroup(entry),
    }
    if (pe.group === 'anthropic') {
      claudeEntries.push(pe)
    } else {
      openaiEntries.push(pe)
    }
  }

  return { claudeEntries, openaiEntries }
}
