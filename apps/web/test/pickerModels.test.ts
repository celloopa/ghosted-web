import { describe, it, expect } from 'vitest'
import { buildPickerEntries } from '../lib/pickerModels'
import type { ModelCatalogEntry, RunnableOpts } from '@ghosted/core'

// ── helpers ───────────────────────────────────────────────────────────────────

function entry(overrides: Partial<ModelCatalogEntry> & { id: string; provider: ModelCatalogEntry['provider'] }): ModelCatalogEntry {
  return {
    label: overrides.id,
    modelClass: 'standard',
    source: 'official',
    ...overrides,
  }
}

const NO_CONNECTIONS: RunnableOpts = {
  claudeCli: false,
  codexCli: false,
  anthropicKey: false,
  openaiKey: false,
}

const CLAUDE_ONLY: RunnableOpts = {
  claudeCli: true,
  codexCli: false,
  anthropicKey: false,
  openaiKey: false,
}

const OPENAI_ONLY: RunnableOpts = {
  claudeCli: false,
  codexCli: false,
  anthropicKey: false,
  openaiKey: true,
}

const ALL_CONNECTIONS: RunnableOpts = {
  claudeCli: true,
  codexCli: true,
  anthropicKey: true,
  openaiKey: true,
}

// ── test 1: hides unavailable entries ────────────────────────────────────────

describe('buildPickerEntries — hides unavailable', () => {
  it('returns empty groups when no connections are active', () => {
    const catalog = [
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6' }),
      entry({ id: 'gpt-5', provider: 'openai', label: 'GPT-5' }),
    ]
    const { claudeEntries, openaiEntries } = buildPickerEntries(catalog, NO_CONNECTIONS)
    expect(claudeEntries).toHaveLength(0)
    expect(openaiEntries).toHaveLength(0)
  })

  it('shows only claude entries when only Claude CLI is connected', () => {
    const catalog = [
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6' }),
      entry({ id: 'gpt-5', provider: 'openai', label: 'GPT-5' }),
    ]
    const { claudeEntries, openaiEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    expect(claudeEntries).toHaveLength(1)
    expect(claudeEntries[0]!.label).toBe('Claude Sonnet 4.6')
    expect(openaiEntries).toHaveLength(0)
  })

  it('shows only openai entries when only OpenAI key is connected', () => {
    const catalog = [
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6' }),
      entry({ id: 'gpt-5', provider: 'openai', label: 'GPT-5' }),
    ]
    const { claudeEntries, openaiEntries } = buildPickerEntries(catalog, OPENAI_ONLY)
    expect(claudeEntries).toHaveLength(0)
    expect(openaiEntries).toHaveLength(1)
  })
})

// ── test 2: dedupes by model id, preferring runnable over non-runnable ────────

describe('buildPickerEntries — deduplication by model id', () => {
  it('dedupes identical id+provider, keeping the one with higher score', () => {
    // Two entries: same id+provider, one is official source, one is openrouter.
    // With ALL_CONNECTIONS both are runnable, but official beats openrouter.
    const catalog = [
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', source: 'openrouter' }),
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', source: 'official' }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, ALL_CONNECTIONS)
    expect(claudeEntries).toHaveLength(1)
    expect(claudeEntries[0]!.label).toBe('Claude Sonnet 4.6')
  })

  it('prefers the runnable entry when one is runnable and one is not', () => {
    // With NO claude connection: both non-runnable → both hidden.
    // With CLAUDE_ONLY: both runnable → deduped to 1.
    const catalog = [
      entry({ id: 'claude-opus-4-8', provider: 'anthropic', label: 'Claude Opus 4.8', source: 'openrouter' }),
      entry({ id: 'claude-opus-4-8', provider: 'anthropic', label: 'Anthropic: Claude Opus 4.8', source: 'official', modelClass: 'deep' }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    // Only one entry survives — must be the official one (higher score)
    expect(claudeEntries).toHaveLength(1)
    // source=official beats source=openrouter in preference score
    expect(claudeEntries[0]!.label).toBe('Anthropic: Claude Opus 4.8')
  })

  it('treats codex and openai entries with the same id as the same model', () => {
    // codex + openai for the same model id → dedupe into one openai group entry
    const catalog = [
      entry({ id: 'gpt-5-mini', provider: 'openai', label: 'GPT-5 mini', source: 'official' }),
      entry({ id: 'gpt-5-mini', provider: 'codex', label: 'Codex with GPT-5 mini', source: 'estimated' }),
    ]
    const { openaiEntries } = buildPickerEntries(catalog, ALL_CONNECTIONS)
    expect(openaiEntries).toHaveLength(1)
  })
})

// ── test 3: dedupes by display label within group ─────────────────────────────

describe('buildPickerEntries — deduplication by display label', () => {
  it('dedupes when two entries share the same label in the same group', () => {
    const catalog = [
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', source: 'official' }),
      entry({ id: 'anthropic/claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', source: 'openrouter' }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    expect(claudeEntries).toHaveLength(1)
  })
})

// ── test 4: empty-group placeholder ──────────────────────────────────────────

describe('buildPickerEntries — empty groups', () => {
  it('returns empty arrays for both groups when no connections', () => {
    const catalog = [
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6' }),
      entry({ id: 'gpt-5', provider: 'openai', label: 'GPT-5' }),
    ]
    const { claudeEntries, openaiEntries } = buildPickerEntries(catalog, NO_CONNECTIONS)
    expect(claudeEntries).toHaveLength(0)
    expect(openaiEntries).toHaveLength(0)
  })

  it('returns empty claudeEntries but populated openaiEntries with openai-only connection', () => {
    const catalog = [
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6' }),
      entry({ id: 'gpt-5', provider: 'openai', label: 'GPT-5' }),
    ]
    const { claudeEntries, openaiEntries } = buildPickerEntries(catalog, OPENAI_ONLY)
    expect(claudeEntries).toHaveLength(0)
    expect(openaiEntries).toHaveLength(1)
  })
})

// ── test 4b: cross-source normalized deduplication (the live-observed pairs) ──

describe('buildPickerEntries — cross-source normalized dedup', () => {
  it('dedupes "Anthropic: Claude Sonnet 4.6" (openrouter) vs "Claude Sonnet 4.6" (fallback), keeping fallback label', () => {
    // Exactly the live pair: openrouter has prefixed label + slash id, fallback has bare label + dash id
    const catalog = [
      entry({
        id: 'anthropic/claude-sonnet-4.6',
        provider: 'anthropic',
        label: 'Anthropic: Claude Sonnet 4.6',
        source: 'openrouter',
      }),
      entry({
        id: 'claude-sonnet-4-6',
        provider: 'anthropic',
        label: 'Claude Sonnet 4.6',
        source: 'official',
      }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    expect(claudeEntries).toHaveLength(1)
    expect(claudeEntries[0]!.label).toBe('Claude Sonnet 4.6')
    expect(claudeEntries[0]!.id).toBe('claude-sonnet-4-6')
  })

  it('dedupes "Anthropic: Claude Haiku 4.5" (openrouter) vs "Claude Haiku 4.5" (fallback), keeping fallback label', () => {
    // Same pattern for Haiku — dot vs dash in version, prefixed vs bare label
    const catalog = [
      entry({
        id: 'anthropic/claude-haiku-4.5',
        provider: 'anthropic',
        label: 'Anthropic: Claude Haiku 4.5',
        source: 'openrouter',
        modelClass: 'small',
      }),
      entry({
        id: 'claude-haiku-4-5',
        provider: 'anthropic',
        label: 'Claude Haiku 4.5',
        source: 'official',
        modelClass: 'small',
      }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    expect(claudeEntries).toHaveLength(1)
    expect(claudeEntries[0]!.label).toBe('Claude Haiku 4.5')
  })

  it('dedupes a pair where ids use dot vs dash notation and labels differ by prefix', () => {
    // Generic version-format collision: "4.6" in id normalized equals "4-6"
    const catalog = [
      entry({
        id: 'anthropic/claude-opus-4.8',
        provider: 'anthropic',
        label: 'Anthropic: Claude Opus 4.8',
        source: 'openrouter',
        modelClass: 'deep',
      }),
      entry({
        id: 'claude-opus-4-8',
        provider: 'anthropic',
        label: 'Claude Opus 4.8',
        source: 'official',
        modelClass: 'deep',
      }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    expect(claudeEntries).toHaveLength(1)
    expect(claudeEntries[0]!.label).toBe('Claude Opus 4.8')
  })

  it('dedupes multiple cross-source pairs simultaneously, producing one entry each', () => {
    // Both Sonnet 4.6 and Haiku 4.5 appear in cross-source pairs; after dedup: exactly 2 entries
    const catalog = [
      entry({ id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic', label: 'Anthropic: Claude Sonnet 4.6', source: 'openrouter' }),
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', source: 'official' }),
      entry({ id: 'anthropic/claude-haiku-4.5', provider: 'anthropic', label: 'Anthropic: Claude Haiku 4.5', source: 'openrouter', modelClass: 'small' }),
      entry({ id: 'claude-haiku-4-5', provider: 'anthropic', label: 'Claude Haiku 4.5', source: 'official', modelClass: 'small' }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    expect(claudeEntries).toHaveLength(2)
    const labels = claudeEntries.map((e) => e.label)
    expect(labels).toContain('Claude Sonnet 4.6')
    expect(labels).toContain('Claude Haiku 4.5')
    // Neither prefixed label should survive
    expect(labels).not.toContain('Anthropic: Claude Sonnet 4.6')
    expect(labels).not.toContain('Anthropic: Claude Haiku 4.5')
  })

  it('does NOT dedup entries from different provider groups that happen to normalize similarly', () => {
    // An OpenAI entry should never collide with an Anthropic entry
    const catalog = [
      entry({ id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', source: 'official' }),
      entry({ id: 'openai/claude-sonnet-4-6', provider: 'openai', label: 'Claude Sonnet 4.6', source: 'openrouter' }),
    ]
    const { claudeEntries, openaiEntries } = buildPickerEntries(catalog, ALL_CONNECTIONS)
    // Both groups keep their entry — groups are independent dedup domains
    expect(claudeEntries).toHaveLength(1)
    expect(openaiEntries).toHaveLength(1)
  })
})

// ── test 5: stable ordering — group (claude first), then class (small→standard→deep), then label ─────

describe('buildPickerEntries — stable ordering', () => {
  it('orders claude group before openai group', () => {
    const catalog = [
      entry({ id: 'gpt-5', provider: 'openai', label: 'GPT-5', modelClass: 'deep' }),
      entry({ id: 'claude-haiku', provider: 'anthropic', label: 'Claude Haiku', modelClass: 'small' }),
    ]
    const { claudeEntries, openaiEntries } = buildPickerEntries(catalog, ALL_CONNECTIONS)
    // Groups are separate arrays — claude always first in the UI
    expect(claudeEntries[0]!.label).toBe('Claude Haiku')
    expect(openaiEntries[0]!.label).toBe('GPT-5')
  })

  it('sorts within a group by modelClass then label', () => {
    const catalog = [
      entry({ id: 'claude-opus', provider: 'anthropic', label: 'Claude Opus', modelClass: 'deep' }),
      entry({ id: 'claude-haiku', provider: 'anthropic', label: 'Claude Haiku', modelClass: 'small' }),
      entry({ id: 'claude-sonnet', provider: 'anthropic', label: 'Claude Sonnet', modelClass: 'standard' }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    expect(claudeEntries[0]!.label).toBe('Claude Haiku')   // small
    expect(claudeEntries[1]!.label).toBe('Claude Sonnet') // standard
    expect(claudeEntries[2]!.label).toBe('Claude Opus')   // deep
  })

  it('sorts alphabetically within the same modelClass', () => {
    const catalog = [
      entry({ id: 'claude-sonnet-z', provider: 'anthropic', label: 'Claude Sonnet Z', modelClass: 'standard' }),
      entry({ id: 'claude-sonnet-a', provider: 'anthropic', label: 'Claude Sonnet A', modelClass: 'standard' }),
    ]
    const { claudeEntries } = buildPickerEntries(catalog, CLAUDE_ONLY)
    expect(claudeEntries[0]!.label).toBe('Claude Sonnet A')
    expect(claudeEntries[1]!.label).toBe('Claude Sonnet Z')
  })
})
