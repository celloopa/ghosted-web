# Ghosted v2 — TDD Rewrite Plan

A full rewrite as a hosted web app, built test-first, simplified around lessons
from v1. New repo (ghosted-web) — v1 stays archived as the TUI/CLI experiment
and remains portfolio material.

## Problem Statement

v1 proved the product model but accumulated surface area (TUI, CLI, scrapers,
multi-agent pipeline) faster than usefulness. Meanwhile the owner's real need —
understanding why applications get no response, and never letting a live
application go stale — was underserved. v2 is a smaller product that does those
two things extremely well, usable by anyone in a browser.

## Lessons Learned (drive every design decision)

| Lesson from v1 | System-level change in v2 |
|---|---|
| Manual status updates go stale | "Ghosted" is a computed state: applied + N days (default 14) with no recorded response. Zero bookkeeping. |
| 8 statuses = friction | 5 user-set statuses: saved → applied → interviewing → offer → closed. ghosted and needs follow-up are derived, never set by hand. |
| Scrapers break weekly | No job-board scraping in MVP. Paste posting text/URL; optional title/company autofill is a P2. |
| No instrumentation = guessing | Stats (response rate by role type, source, resume version; time-to-response) are a core table-stakes screen, not an add-on. |
| Automation rewarded volume | No document generation in product. A role_type + fit reflection field nudges targeting discipline instead. |
| Local-only = untestable by others | Hosted, accounts, magic-link auth. JSON import/export preserves the local-first escape hatch. |

## Goals

1. A stranger signs up and tracks their first application in under 2 minutes.
2. The owner can answer "where does my funnel break, by role type?" from real data within 2 weeks of use.
3. No live application silently goes stale: ghost detection + follow-up nudges surface action items daily.
4. ≥ 90% of domain logic covered by fast unit tests; every behavior in this doc exists as a named test before its implementation.

## Non-Goals

- Resume/cover letter generation, AI agents, or ATS checking (stays in local v1 toolchain if wanted)
- Job board scraping/integrations
- Teams, sharing, billing
- Native/mobile apps (responsive web only)
- Browser extension (P2 idea, parking lot)

---

## Product Model (the whole thing)

```
User
Application:
  company, position, role_type (design_engineer | product_designer | brand_motion | other)
  source (derived from job_url host, or manual)
  status: saved | applied | interviewing | offer | closed
  closed_reason?: rejected | withdrawn | accepted
  date_applied?, salary_min?, salary_max?, location?, remote?
  resume_version?, job_url?, notes?
  events[]: { type: applied | response | interview | follow_up | note, date, detail? }

Derived (computed, never stored as status):
  is_ghosted(app, today, threshold=14d): applied, no `response` event within threshold
  needs_follow_up(app, today): applied 7d ago, no response, no follow_up in last 7d
  stats(apps[]): response_rate, interview_rate, time_to_first_response —
                 grouped by role_type, source, resume_version
```

Event log is the key structural change: statuses become a summary of events,
ghost/follow-up logic reads events, and stats fall out of timestamps. One
source of truth.

## Architecture

- **packages/core** — pure TypeScript, zero dependencies, no framework, no I/O. Contains the entire product model above. This is where TDD lives and where ~90% of tests run in milliseconds.
- **Web app** — Next.js (App Router) on Vercel. Thin UI over core functions.
- **Supabase** — Postgres (applications + events tables, user_id on every row), magic-link auth, Row Level Security written and tested before first insert.
- **Types** — generated from the database (supabase gen types), core package consumes them.

## Test Strategy (the TDD contract)

Pyramid:
1. **Unit** (Vitest, packages/core) — the bulk. Ghost detection, follow-up rules, status transitions, stats math, import parsing. Written first, always.
2. **Component** (React Testing Library) — forms validate, lists render derived badges, dashboard renders stats from fixture data.
3. **RLS/security** (Supabase local + SQL tests) — user A cannot select/update/delete user B's rows. Treated as P0 features with tests, not config.
4. **E2E** (Playwright, small set) — signup → add application → see it on board; import a v1 JSON file; mark a response and watch ghost badge clear.

Working agreement for every Claude Code session:
1. Pick one behavior from this plan.
2. Write the failing test(s) — names mirror the acceptance criteria below.
3. Implement minimum to pass. Refactor. Commit with test + code together.
4. Never write UI before the core function it renders is tested.

Definition of done per behavior: failing test existed first; passes; no skipped
tests; RLS tests still green.

---

## MVP Scope (Weekend 1)

### M1. Core domain package ✅ 2026-06-11

- [x] transition(app, newStatus) enforces legal moves; closed requires closed_reason
- [x] isGhosted true at exactly threshold+1 days, false with any response event
- [x] needsFollowUp respects 7-day cadence and stops after a response
- [x] computeStats returns correct rates and groupings for fixture sets, handles empty/unclassified groups
- [x] parseV1Import(json) maps v1 applications.json (8 statuses → 5 + events) losslessly; invalid input returns typed errors, never throws

### M2. Auth + persistence

- [ ] Magic-link signup/login
- [ ] RLS: cross-user access denied (tested for select, insert, update, delete)
- [ ] New accounts seeded with 3 sample applications

### M3. Tracker UI

- [ ] Add application in one form, ≤ 7 fields visible by default
- [ ] Board/list with derived badges: 👻 ghosted, ⏰ follow up
- [ ] Recording a response event clears ghost state without status edits

### M4. Stats screen

- [ ] Response + interview rate by role_type, source, resume_version
- [ ] Matches computeStats fixture output exactly (same function, no reimplementation)

## Weekend 2 (polish to public MVP)

- [ ] "Today" view: everything needing follow-up, one-tap log of a follow-up event
- [ ] v1 JSON import UI + JSON export; account deletion
- [ ] Detail view with event timeline
- [ ] Landing page with the Ghosted voice ("for the perpetually ghosted")
- [ ] Empty states, responsive pass, feedback link
- [ ] Invite-code gate (open signup is a flip later)

## Parking Lot (P2 — design for, don't build)

- Browser extension / share-target for one-click capture
- ghosted sync bridge from v1 CLI (note: `ghosted2 list --json` → parseV1Import already works)
- Email digest of follow-ups
- Title/company autofill from pasted URL

## Success Metrics

- Leading: signup→first application < 2 min in usability tests; owner's full history imported; daily "Today" view usage by owner.
- Lagging (60 days): owner's interview rate by role_type after retargeting; 5+ external active users; zero stale live applications.

## Usability Testing (built into Weekend 2 + following week)

3–5 testers, at least 3 non-technical. Tasks: sign up, add a real application,
interpret the stats screen, act on a follow-up nudge. One iteration shipped
from findings. All of it documented for the case study.

## Open Questions → resolved in DECISION_INTERVIEW.md

- Ghost threshold: **fixed 14 days** for v1 (config is one column later)
- Events editable/deletable: **append-only with corrections** (logged-in-error flag)
- Keep the v1 Go repo public as-is: **yes** — "v1: the terminal experiment" in the case study

## Suggested Claude Code Session Order

1. ✅ Scaffold: pnpm monorepo (packages/core, apps/web), Vitest wired, CI running tests on push
2. ✅ M1 core domain, strictly test-first (this is most of the product)
3. Supabase schema + RLS with security tests (M2)
4. M3 tracker UI on top of tested core
5. M4 stats screen reusing computeStats
6. Weekend 2 items in listed order
