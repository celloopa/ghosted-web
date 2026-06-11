# Ghosted v2 (`ghosted-web`)

> Ghosted turns the silence of your job search into data and next actions.
> **Silence, measured.**

A hosted, test-first rewrite of [ghosted](https://github.com/celloopa/ghosted)
(v1, the terminal experiment). Statuses are a summary of **events**; the
painful states — 👻 ghosted, ⏰ needs follow-up — are computed, never
bookkept.

## Repo map

```
packages/core   # the entire product model — pure TS, zero deps, 44 tests
apps/web        # Next.js (App Router) — thin UI over core (placeholder until M3)
docs/           # the governing documents:
  GHOSTED_V2_PLAN.md     # build plan + milestones (the contract)
  DESIGN_DOC.md          # the why-it-feels-this-way doc
  DECISION_INTERVIEW.md  # all design decisions, answered, with rationale
  STARTING_BRIEF.md      # one-page synthesis — read this first
  TOKENS.md              # token starter table (dark+light, AA-checked)
  COMPONENT_BRIEF.md     # the 4 components to build before any screen
  M3_CHECKLIST.md        # UI build order
  TDD_RECEIPT.md         # red run → green run, captured
```

## Develop

```bash
pnpm install
pnpm test        # 44 unit tests, ~12ms
pnpm typecheck
pnpm dev         # placeholder page proving core wiring + tokens
```

## Working agreement (the TDD contract)

1. Pick one behavior from the plan.
2. Write the failing test(s) — names mirror acceptance criteria.
3. Implement minimum to pass. Refactor. Commit test + code together.
4. Never write UI before the core function it renders is tested.

## Status

- [x] Scaffold: pnpm monorepo, Vitest, CI
- [x] M1 core domain (test-first: transition, isGhosted, needsFollowUp, computeStats, parseV1Import, deriveSource)
- [ ] M2 Supabase: magic-link auth, RLS tested before first insert, seeded samples
- [ ] M3 tracker UI (see docs/M3_CHECKLIST.md)
- [ ] M4 stats screen (renders `computeStats` output verbatim)
