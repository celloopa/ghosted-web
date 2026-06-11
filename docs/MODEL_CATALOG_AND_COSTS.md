# Model catalog, pricing, and generation stats

Goal: keep Ghosted’s model picker from going stale, estimate cost before/after generation, and build evidence for “which model works best for applications.”

## Sources

1. **Provider docs are primary for official model names and first-party prices.**
   - Anthropic documents current Claude IDs, context windows, and pricing.
   - OpenAI documents current GPT pricing.
2. **OpenRouter is the refresh/reference source.** Its Models API returns a standardized list with `id`, `name`, `context_length`, `top_provider.max_completion_tokens`, `supported_parameters`, and per-token `pricing` fields.
3. **Local fallback catalog ships in code.** If OpenRouter is down or a local dev machine has no network, Settings still works.

## Pricing shape

Ghosted mirrors Pi’s cost buckets:

```ts
usage: { input, output, cacheRead, cacheWrite, internalReasoning }
cost:  { input, output, cacheRead, cacheWrite, internalReasoning, request, total }
```

OpenRouter’s prices are already USD per token. Official provider pages usually publish USD per 1M tokens, so code converts with `price / 1_000_000`.

## Estimation rule

Before the provider returns real usage, local-only Ghosted estimates tokens as `ceil(chars / 4)`. That is intentionally approximate; the provider usage becomes the source of truth when available.

CLI-based subscription runs (Claude Code/Codex) may not expose machine-readable usage, so those records stay marked `costEstimated: true`.

## Run tracking

Every `/api/generate` call appends a local JSONL record to:

```txt
apps/web/.ghosted-local/generation-runs.jsonl
```

Each record includes provider, model, method, task, duration, prompt/response size, usage, cost, and success/error. Later, a user rating can be attached so Settings can compare:

- average cost per task
- average rating per model
- failure rate
- latency
- revision count needed before “sendable”

## Current MVP UI

- Settings → AI connection + model: fetches `/api/models`, backed by OpenRouter, with fallback catalog.
- Settings → Generation stats: reads `/api/generate/stats` and shows local cost totals by model.

## Next gates

- Add “rate this draft” on generated materials.
- Add per-task estimate before clicking Generate.
- Add model recommendation labels: cheapest, best local default, best quality once enough ratings exist.
