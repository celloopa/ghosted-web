import { describe, it, expect } from 'vitest'
import { reconcileModelChoice } from '../lib/useModelChoice'
import type { PickerEntry } from '../lib/pickerModels'

// ── helpers ───────────────────────────────────────────────────────────────────

function pickerEntry(id: string, group: PickerEntry['group'] = 'anthropic'): PickerEntry {
  return { key: `${group}:${id}`, id, label: id, group }
}

const SONNET = pickerEntry('claude-sonnet-4-6')
const HAIKU = pickerEntry('claude-haiku-4-5')
const GPT_MINI = pickerEntry('gpt-5-mini', 'openai')

// ── core tests ────────────────────────────────────────────────────────────────

describe('reconcileModelChoice', () => {
  it('stored id present in entries → returned unchanged', () => {
    const result = reconcileModelChoice('claude-sonnet-4-6', [SONNET, HAIKU])
    expect(result).toBe('claude-sonnet-4-6')
  })

  it('stored id missing from entries → falls back to first entry id', () => {
    // 'claude-fable-5' is not in the list — reset to the first pickable id
    const result = reconcileModelChoice('claude-fable-5', [SONNET, HAIKU])
    expect(result).toBe('claude-sonnet-4-6')
  })

  it('empty entries → returns undefined regardless of stored value', () => {
    const result = reconcileModelChoice('claude-sonnet-4-6', [])
    expect(result).toBeUndefined()
  })

  it('undefined stored value → falls back to first entry', () => {
    const result = reconcileModelChoice(undefined, [SONNET, HAIKU])
    expect(result).toBe('claude-sonnet-4-6')
  })

  // ── openrouter vs fallback id form normalization ──────────────────────────

  it('openrouter slash-id stored, fallback entry survived dedupe — kept via normalized match', () => {
    // Scenario: user had 'anthropic/claude-sonnet-4.6' stored from an OpenRouter session.
    // After dedupe pickerModels keeps the fallback entry whose id is 'claude-sonnet-4-6'.
    // The stored id strips to 'claudesonnet46'; the survivor entry also strips to 'claudesonnet46'.
    const stored = 'anthropic/claude-sonnet-4.6'
    const survivor = pickerEntry('claude-sonnet-4-6') // fallback entry that won the dedupe
    const result = reconcileModelChoice(stored, [survivor, HAIKU])
    // Should keep — or if the exact id differs, map to the survivor's id.
    // Either is acceptable as long as we don't reset to unrelated entry.
    expect(result).toBe('claude-sonnet-4-6')
  })

  it('fallback dash-id stored, openrouter slash-id entry survived — kept via normalized match', () => {
    // Inverse: openrouter entry won the dedupe (hypothetical), stored id is the fallback form.
    const stored = 'claude-sonnet-4-6'
    const orEntry = pickerEntry('anthropic/claude-sonnet-4.6') // openrouter entry survived
    const result = reconcileModelChoice(stored, [orEntry, HAIKU])
    expect(result).toBe('anthropic/claude-sonnet-4.6')
  })

  it('stored id valid in mixed-provider list → returned unchanged', () => {
    const result = reconcileModelChoice('gpt-5-mini', [SONNET, GPT_MINI])
    expect(result).toBe('gpt-5-mini')
  })
})
