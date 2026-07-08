# Handoff: Ghosted blog post + case study update

For the agent writing (1) a blog post for cello.design and (2) the update to
https://cello.design/projects/ghosted/. Everything below is verified against the
repo at `~/Documents/code/ghosted-web` and the deployment as of 2026-07-07.
The current case study ends at the Go TUI prototype — this handoff covers the
second act: the rewrite into a live web product.

---

## 1. The story (chronological, with the beats that matter)

### Where the case study currently stops
A Go/Bubble Tea terminal app (`~/Documents/code/ghosted`): local JSON store,
keyboard-driven tracker, agent-editable via CLI commands. The published case
study frames it as "code as a design medium" and ends on a roadmap. Keep all
of that — it's act one.

### Act two: the rewrite (June–July 2026)
- **Decision interview first.** Before writing code, a structured interview
  settled scope: what stays (tracking discipline, derived statuses), what dies
  (TUI, local-only thinking), what's genuinely new (the apply flow).
- **The plan said "no doc generation."** The v2 plan explicitly listed cover
  letter/resume generation as a non-goal. It came back within days — the
  differentiator turned out to be the *pair*: tracker + apply flow in one
  place. Honest reversal, worth telling.
- **Architecture pivot: "Minimum Viable Intelligence" (MVI).** Early designs
  reached for an agent-SDK/Payload/Supabase stack. All dropped. Final
  principle: **deterministic code does everything it can; the model only
  writes prose; code validates the model.** Concretely:
  - Code parses the posting, computes keyword overlap + fit score, plans the
    resume reorder, builds the one bounded prompt, parses the response.
  - The model writes: cover letter, summary line, bullet rewrites, angles,
    standout suggestions, Q&A answers. Nothing else.
  - Code checks the model's work: 180-word hard cap, banned-phrase list
    ("I'm excited to", "aligns perfectly", "passionate about"…), and honesty
    flags that catch invented numbers/tools not present in the CV.
- **One bounded call, not a chat.** There is no conversation with the model.
  One prompt in, one JSON object out, validated. Revisions are *targeted*: a
  focused prompt that may change only the cover letter and returns only the
  cover letter — everything else is untouched by construction.
- **No accounts, deliberately.** localStorage per device behind repo
  interfaces (a server backend can swap in later). Chosen over accounts to
  get real testers in fast.
- **Generalized past design/eng.** A non-designer tester forced it: 15 role
  presets + write-your-own role types, keyword lexicons per field.
- **The product flow** (this is the demo spine): drop a posting URL →
  deterministic parse + fit score with matched/missing keywords → generate
  materials (letter, summary, rewrites-as-triage where each suggestion is
  accepted/rejected/edited, opportunity angles, standout moves) → targeted
  revise with draft history (previous versions, preview + restore) →
  Typst PDF export (modern-cv template) that is **ATS-validated by
  re-extracting the text with pdftotext and diffing it** → mark applied →
  documents hub. Plus CV-builder onboarding: interview / upload a PDF
  (pdftotext, screenshot-vision fallback) / paste JSON Resume.
- **Numbers:** pnpm monorepo, `packages/core` pure TS (~330 tests) +
  `apps/web` Next.js (~410 tests), ~741 tests total. Voice: deadpan —
  tagline "Silence, measured." Warm-dark amber/cream tokens.

### Act three: shipping it to real people (the good war stories)
- **House account.** Non-technical testers shouldn't need API keys, so the
  server generates on the owner's own subscription, invite-gated with a
  daily cap.
- **The Claude CLI surprise** (best technical anecdote in the whole story):
  piping the generation prompt to `claude -p` fails — the CLI is a full
  *agent*, and it **refused the app's own prompt as a suspected prompt
  injection**, then hung loading MCP servers until a 240s timeout. The same
  prompt through `codex exec` returned clean JSON in seconds. Lesson: an
  agent CLI and a text-completion API are different species; the agent has
  opinions.
- **The pivot to Codex as the house account.** Claude setup-tokens kept
  invalidating (re-running setup-token kills the old token). Solution:
  install the Codex CLI in the Docker image, seed the ChatGPT-login
  `auth.json` from a base64 secret into a persistent volume at container
  start. Two container-only bugs: Typst package cache (the template's
  packages must be pre-downloaded at image build — containers can't fetch at
  runtime) and codex refusing to run outside a git repo
  (`--skip-git-repo-check`).
- **A security hole caught before it bit:** once codex existed in the
  image, the models API started advertising it to every visitor — and a
  visitor with their own key could route through the owner's subscription
  *uncapped*. Fixed server-side (server CLIs are never a BYOK offer).
- **Honest loading states.** The codex CLI can't stream, so instead of a
  fake progress bar the UI shows a truthful phase ticker: "assembling the
  prompt — cv, posting, fit" → "writing with Codex with GPT-5.5 — 23s" with
  dry sub-lines ("still writing. letters take longer than chips suggest.")
  → "checking the draft — word cap, banned phrases, honesty flags." The
  design position: *if you don't know the progress, don't invent it.*
- **Partner testing fed real fixes:** a double-click that "lost her turn"
  → an ActionButton with a synchronous double-fire guard; overwide layout
  dialed in; targeted revision instead of regenerate-everything.

### Themes to thread through both pieces
1. Same thesis as act one, escalated: building the real thing forces the
   design decisions ("where should the human stay in control?" now has a
   production answer: triage UI, honesty flags, bounded calls).
2. AI is a component, not the architecture. The deterministic 90% is what
   makes the 10% of prose trustworthy.
3. Shipping to non-technical testers is a design constraint that reshaped
   auth, error copy, and loading states.

---

## 2. Blog post outline

**Working titles** (pick or riff):
- "The model only writes prose: shipping an AI feature that can't lie"
- "Minimum Viable Intelligence"
- "My job tracker refused its own prompt" (anecdote-first angle)

**Audience:** designers who code / engineers who design; people adding AI to
products.

**Outline:**
1. Cold open — the `claude -p` injection-refusal anecdote. Your own app's
   prompt, refused by the CLI as an attack. 240s hang, exit 143.
2. Back up: what Ghosted is, one paragraph. TUI origin, one paragraph
   (link to case study).
3. The reversal: "the plan said no doc generation." Why it came back.
4. MVI, the core of the post: the deterministic pipeline, the one bounded
   call, code-checks-the-model (banned phrases, word cap, honesty flags).
   Show the actual banned-phrase list — it's funny and concrete.
5. Trust UX: triage instead of paste-over, honest ticker instead of fake
   progress, ATS validation by re-extracting the PDF.
6. The subscription saga condensed: agent CLI ≠ API; the codex pivot; the
   uncapped-bypass hole. Each gets a paragraph, not a section.
7. Close: what per-device/no-accounts bought and what it costs; what's next
   (accounts, telemetry). Invite line if desired.

**Length:** 1,200–1,800 words. Code snippets: the banned-phrase array, the
ticker sub-lines, maybe the one-line `--skip-git-repo-check` fix as a punchline.

---

## 3. Case study update outline

Keep the existing page's structure and voice ("measured, technical
specificity with reflective product thinking"). Add act two as new sections
after the current roadmap (or restructure into "Prototype" / "Product"):

1. **From prototype to product** — the decision interview; what the TUI
   proved and what it couldn't (nobody else could use it).
2. **Minimum Viable Intelligence** — the architecture section. Diagram:
   pipeline of deterministic stages with the single model call highlighted.
3. **The apply flow** — capture → fit → materials → triage → export →
   applied. This is the imagery-heavy section.
4. **Where the human stays in control** (callback to act one's key
   question) — triage decisions, honesty flags, targeted revision, draft
   history.
5. **Shipping on a subscription** — house account, invite gate, the agent
   CLI lesson, the codex pivot. Short.
6. **Outcome** — live at ghosted.cello.design, tester round, 741 tests,
   what changed from feedback.
7. **Roadmap (updated)** — accounts/server backend, UX telemetry + owner
   annotation mode, agent-editable UI extensions (all currently in
   planning — see docs/PLAN-telemetry-agent-ui.md when it lands).

---

## 4. Imagery / video shot list

Use seeded demo data (an "Acme — Product Designer" style application), never
real applications, real CV content, or the invite code. Dark theme.

**Capture division of labor: the agent captures every still itself via
browser automation. Cello only records the videos marked CELLO.**

### Agent self-capture setup (do this, don't ask Cello for screenshots)

1. Run the app locally from `~/Documents/code/ghosted-web`:
   `GHOSTED_HOUSE_PROVIDER=codex GHOSTED_HOUSE_MODEL=gpt-5.5 pnpm --filter web dev --port 3010`
   (hosted mode with the codex house — the owner's Mac has the codex CLI
   logged in, so real generations work. No invite code needed locally.)
2. Seed demo data by setting localStorage before navigating:
   key `ghosted.applications.v1` = an array with one application
   (`{ id, company: 'Acme', position: 'Product Designer', role_type:
   'design', status: 'saved', needs_materials: true, posting: { description,
   fit_score, fit_notes, matched, missing, analyzed_at }, events: [] }`) —
   then `/apply?id=<id>` lands in the workspace. A baseline CV may need
   seeding for generation: check `apps/web/lib/baselineRepo.ts` for the key
   and shape, or run the onboarding flow once by hand in the automated
   browser.
3. Capture with whichever browser tooling is connected: the Claude-in-Chrome
   extension or the chrome-devtools MCP (`navigate_page` → `resize_page` to
   1440×900 → `take_screenshot`). Force dark mode (`emulate` /
   prefers-color-scheme: dark). For the ticker shot, click Generate and
   screenshot ~5–20s in while it's mid-write.
4. The TUI half of still #1 is the existing case-study asset — reuse it.
5. The PDF for still #8: hit the export endpoint in-app and screenshot the
   downloaded PDF's first page (any PDF viewer, or convert with
   `pdftoppm -png -r 120`).
6. The MVI diagram: build it as code (SVG/HTML), don't screenshot a sketch.

### Stills (ALL agent-captured)

1. TUI screenshot (existing asset) side-by-side with the web list — the
   "same product, two media" hero.
2. Capture flow: posting URL drop + the intent fork ("what happens next?").
3. Fit card: score /100 with matched (amber) vs missing keyword chips.
4. Materials workspace, full: letter + rewrites triage + angles + standout
   moves visible.
5. Rewrites triage close-up: accept / reject / edit on one suggestion.
6. GenerationStatus ticker mid-write: "writing with Codex with GPT-5.5 — Ns"
   with the sub-line visible. (Real generation, real timer — screenshot
   mid-flight.)
7. Draft history open: "Previous versions (N)" with preview + restore.
8. Exported PDF (modern-cv template) next to the ATS-validation output.
9. Settings: "✓ generating on the shared account — Codex with GPT-5.5.
   nothing to set up." + the read-only "shared account · Codex with GPT-5.5"
   chip.
10. Stats page (response rates by role type/source).

### Video — ONLY these two need Cello (30–60s screen recordings)

A. **CELLO** — The whole loop: paste URL → fit appears → generate (ticker
   runs) → materials land → export PDF. Cut waiting time; keep ~3 real
   seconds of ticker so the honesty reads.
B. **CELLO** — Targeted revise: type "make it warmer", only the letter
   changes, history grows, restore an old draft.
C. (Optional, agent may attempt) Terminal clip: `claude -p` refusing the
   prompt vs `codex exec` returning JSON. If the agent can't produce clean
   terminal footage, a styled code-block "transcript" of the two commands
   and their responses works nearly as well inline in the blog — do that
   instead of asking Cello.

**Diagram to commission/draw:** the MVI pipeline — posting → parse → fit →
plan → [ONE MODEL CALL] → parse → validate (word cap / banned / honesty) →
triage UI. Deterministic stages in cream, the model call as the single amber
block.

---

## 5. Verification pointers (for accuracy, not publication)

- Repo: `celloopa/ghosted-web`; core logic `packages/core/src/generate.ts`
  (prompt, banned phrases, letter check), `posting.ts`/`analyze.ts` (parse +
  fit), `honesty.ts` (flags), `export.ts` + `apps/web/tools/ats/` (ATS
  validation).
- Ticker: `apps/web/components/GenerationStatus.tsx`. Triage: materials
  panels in `apps/web/app/apply/page.tsx`.
- Deploy story commits: `31e205a` (codex house), `4bd52bb` (hosted UX +
  guard + ticker), `54d0b5d` (--skip-git-repo-check fix).
- Live: https://ghosted.cello.design (invite-gated).

## 6. Don'ts

- No real CV/application data, tokens, invite codes, or server IPs in any
  asset or copy.
- Don't call it "fully autonomous" anything — the whole point is bounded.
- Don't promise accounts/telemetry as shipped; they're roadmap.
- Keep the deadpan register; no exclamation marks in product copy quotes.
