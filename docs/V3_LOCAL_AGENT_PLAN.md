# v3 local agent slice — minimum viable intelligence

Status: implemented locally first. Payload/server storage remains deferred.

## What Claude already completed

- Local `/apply` workspace: URL or pasted posting → deterministic parse → fit report → tracked application.
- Baseline onboarding: JSON Resume, voice samples, links, targeting, constraints.
- Local AI connection storage: browser-only, no server account yet.
- One bounded generation endpoint for Claude, with deterministic prompt building, JSON parsing, word-count and banned-phrase validation.
- Resume adjustments are code-generated: bullet reorder, skills reorder, honesty/gaps section.

## v3 product decision

The product should not be a general agent for applying. The deterministic app does most of the work:

1. Fetch/paste posting.
2. Parse facts from JSON-LD/HTML.
3. Extract keywords from a curated lexicon.
4. Score fit against CV and constraints.
5. Rank resume bullets and skills.
6. Build the generation prompt.
7. Validate model output.
8. Store/copy materials locally.

The model only writes two prose fields:

- one resume summary line, under 40 words
- one cover letter body, under 180 words

Revision prompts are small variation requests, e.g. “tighter opener” or “lead with design systems.”

## Model class

Default to a small/standard model, not a SOTA/deep reasoning model. The app has already computed the facts and constraints. The model is doing bounded writing, not open-ended research or planning.

Recommended local choices:

- Codex CLI: `gpt-5-mini` first, `gpt-5.5` if the letter needs more judgment.
- Claude CLI/API: `claude-haiku-4-5` for cheap drafts, `claude-sonnet-4-6` for the default stronger pass.
- OpenAI API: `gpt-5-mini` for small draft work, `gpt-5.1` for stronger prose.

## Local-only boundary

- Auth/model preferences are still localStorage.
- Codex and Claude subscription support run through local CLIs.
- API keys/tokens are only sent from this browser to the local Next route, then to the selected provider.
- No hosted persistence, Payload, or encrypted server credential store yet.

## Implemented in this slice

- Codex provider support in core auth validation.
- Settings model picker shared by Claude, Codex, and OpenAI connections.
- Model catalog refreshes from OpenRouter while retaining a local fallback.
- Local generation stats use Pi-inspired usage/cost buckets for future price/performance comparison.
- `/api/generate` can run:
  - Claude CLI with selected model
  - Codex CLI with selected model, read-only sandbox, ephemeral session
  - Anthropic Messages API
  - OpenAI Responses API
- Generated materials store the model id for local auditability.
- `/api/models` exposes refreshed model metadata/pricing.
- `/api/generate/stats` summarizes local generation JSONL telemetry.
