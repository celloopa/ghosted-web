# Iteration 3 — "Apply with Ghosted"

> Owner decision 2026-06-11: document generation returns to the product as an
> agent-driven applying workflow. This deliberately reverses the v2 plan's
> "no doc generation" non-goal — the differentiator is now the pair:
> event-driven tracker (v2 core, unchanged) + an agentic apply flow.
> The volume-discipline guardrail survives as the fit gate.

## The mental model

The app **is a Claude Code instance served as a UI**. Payload stores the
context (baseline, applications, documents, research, chat threads); the
Claude Agent SDK runs the agent server-side with that context injected; the
web UI is a thin, fast surface over both. Skills and tools — not screens —
orchestrate the job application.

```
apps/web (Next.js + Payload 3 embedded)
├── packages/core            unchanged — statuses, derived states, stats
├── Payload collections      the database AND the agent's context store
│   ├── users                Payload auth (replaces Supabase magic-link plan)
│   ├── applications         v2 model; events as array field; access: own-rows
│   ├── baseline             versioned: cv.json (JSON Resume), voice samples,
│   │                        links, constraints (location/salary/visa), template ref
│   ├── documents            generated artifacts: cover letter, resume
│   │                        adjustments, answers + rendered PDFs (uploads)
│   ├── research             per-application company crawl results + user notes
│   └── threads              agent chat transcripts per application
└── /api/agent               Claude Agent SDK session (streaming)
    └── tools
        ├── read_baseline        from Payload
        ├── fetch_posting        URL → text (reuse ghosted2's fetch lessons)
        ├── research_company     small crawl: site, about, recent news → facts
        ├── extract_keywords     posting → keywords/requirements vs CV overlap
        ├── save_document        write/version doc in Payload
        ├── render_pdf           Typst (ats-job-docs template + validate_ats loop)
        ├── update_application   status/events via core transition rules
        └── draft_answer         additional application questions
```

Agent system prompt = the ats-job-docs skill rules, verbatim where they're
hard rules: CV is the single source of truth, never invent; cover letter
≤180 words, banned phrases list, transplant test; fit gate at 60 (warn,
allow override); ATS validation loop before any PDF is "done".

## The Apply workflow (one screen, minimal)

`/apply` → drop URL → agent workspace for that application:

| Zone | Contents |
|---|---|
| Header | company · position · fit score · keywords chips · "Mark applied" (logs event, enters tracker) |
| Left | job description (cleaned), company research facts, **notes** field |
| Center | the documents: cover letter, resume adjustments, answers — with PDF download per doc |
| Bottom/right | **chat**: edit requests ("tighter opener"), additional questions ("they ask about visa status") — every reply can update documents in place |

Performance + aesthetic constraints: server components where possible,
streaming agent output, no client state library, tokens from TOKENS.md,
Geist throughout, zero decoration that doesn't carry information.

## What this retires

- `supabase/` migrations + RLS tests + M2_SUPABASE.md — superseded by Payload
  auth + collection `access` functions (same own-rows guarantee, tested at the
  Payload layer). Keep the files one commit for history, then delete.
- The localStorage repo remains the logged-out/demo path; the Payload local
  API becomes the real one behind the same port.

## Build order (next sessions)

1. Payload 3 into apps/web: SQLite adapter (dev), users + applications +
   baseline collections, own-rows access tests, migrate tracker screens from
   LocalStorageRepo → server routes on Payload local API.
2. Baseline ingest: seed from Cello's kit (below); baseline editor screen.
3. Agent route with read_baseline/fetch_posting/save_document; chat UI;
   cover letter + resume adjustments end-to-end (markdown only).
4. render_pdf (Typst + validate_ats), research_company, keywords; the full
   /apply workspace.
5. Polish pass against the aesthetic bar + perf budget (LCP < 1s local).

## What Cello provides (the ask list)

1. **Baseline kit** (~30 min, one-time):
   - Bless or update `ghosted/local/cv.json` as the canonical JSON Resume.
   - 1–2 past cover letters you'd actually send again (voice calibration).
   - Links: portfolio, GitHub, LinkedIn, Bluesky.
   - Hard constraints: location/remote, salary floor, visa, role types in/out.
   - Confirm `ats-job-docs/assets/resume-template.typ` as the PDF template.
2. ~~Agent auth decision~~ **Built into onboarding (Connect step + Settings):**
   users pick Claude Code login (dev), a `claude setup-token` subscription
   token, or an Anthropic/OpenAI API key. The agent route reads this
   connection; iteration 3 moves stored keys server-side encrypted.
3. **DB confirm**: Payload 3 embedded, SQLite locally, Postgres at deploy
   time. Veto if you want Postgres from day one.
4. **Aesthetic direction**: bless the current warm-dark token set as the base
   or hand me references/edits (TOKENS.md or straight in the Figma file).
   This iteration is where "fits my aesthetic as a designer" gets enforced —
   your art direction, my implementation, review per screen.
5. Nothing to install — Payload needs no Docker; Typst is already on the machine.
