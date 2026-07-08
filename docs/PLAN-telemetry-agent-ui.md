# Telemetry, annotations, agent-editable UI, and tester reports — design plan

Status: proposal, not implemented. No code changes ship from this document.

This covers four asks that turned out to share one skeleton: a role gate,
an anonymous session id the app already mints, and the `.ghosted-local`
JSONL-on-a-volume pattern `generationTelemetry.ts` and `genCap.ts` already
use. Reusing that skeleton four times, instead of inventing four storage
strategies, is the point of this plan.

1. UX telemetry — what's used, how long, where people bail.
2. Owner annotation mode — pin a note to a component while using the app.
3. Agent-editable UI — ask an in-app agent to bend a screen to how the owner
   actually works, without giving it a shell.
4. Tester roles, usage reports, and the annoying-marker — the tester-facing
   half: local pseudonym profiles, consented usage reports sent to the
   owner, and a discrete "this is annoying" flag.

All four are additive. Nothing here touches `Application`, `AIAuth`,
`Baseline`, or any existing repo/route. A tester notices exactly three
things: a disclosure line, an occasional non-blocking prompt offering to
send a usage report, and one quiet affordance for flagging annoyances.

---

## Shared foundations

### The role gate (owner vs. tester)

Nothing here works without a way to tell "Cello" from "a tester," and the
codebase currently has no such concept — `ghosted_invite` (see
`apps/web/middleware.ts`, `apps/web/lib/server/inviteGate.ts`) gates
*everyone* in behind one shared code. Stats, settings, generation runs — a
tester sees all of it today. That's fine for stats; it is not fine for
"read every tester's rage-clicks" or "let the owner rewrite live UI."

The concept is a **role**, not just a gate: every invited visitor is a
`tester` by default; presenting `GHOSTED_OWNER_KEY` once upgrades that
browser to `owner`. Two roles, no third. This is deliberately not an
accounts system — the invite cookie answers "may you be here," the owner
cookie answers "are you Cello," and everything else stays per-device.

Add a second, narrower gate, same shape as the first:

- `GHOSTED_OWNER_KEY` env var (Coolify secret, like `GHOSTED_INVITE_CODE`).
- `apps/web/lib/server/ownerGate.ts` — pure function `isOwner(cookie, key)`,
  unit-testable exactly like `inviteGate.ts`'s `needsUnlock`.
- `POST /api/owner-unlock` — same shape as `/api/unlock` — sets an
  `httpOnly`, `sameSite: lax`, 30-day `ghosted_owner` cookie.
- `/owner-unlock` page — same shape as `/unlock/page.tsx`, linked only from
  `/settings` (not in `Nav.tsx` — no reason to advertise it to testers).
- Extend `GET /api/config` (`apps/web/app/api/config/route.ts`) with an
  `owner: boolean` field, computed server-side from the cookie — never
  trust a client claim of ownership. Add `useOwner()` next to `useHosted()`
  in `apps/web/lib/useHosted.tsx` (same shared-promise-per-page pattern).
- Every owner-only route below checks `isOwner` itself — belt and
  suspenders beyond `useOwner()` hiding the UI, the same way `houseConnection.ts`
  never trusts client-supplied auth without validating it server-side.

If `GHOSTED_OWNER_KEY` is unset, the gate is off in local dev (mirrors the
invite gate's "no env var, no gate" default) and `isOwner` is always true —
so local development never blocks on this.

**Who sees what.** The full surface map, so nothing is ambiguous later:

| Surface | Owner | Tester |
|---|---|---|
| The product (`/`, `/applications`, `/apply`, `/stats`, `/settings`, `/onboarding`) | ✓ | ✓ |
| `/telemetry` dashboard, `GET /api/telemetry` | ✓ | — |
| Annotation mode hotkey, `/annotations`, `/api/annotations` | ✓ | — |
| Extension slots' "improve this" affordance, `/extensions`, `/api/ui-extensions*` | ✓ | — |
| `/reports` review queue, `GET`/`DELETE /api/reports` (Capability 4) | ✓ | — |
| Tester profile card in `/settings` (Capability 4) | ✓ (hidden — pointless for the owner) | ✓ |
| Report prompt + consent screen, `POST /api/reports` | — | ✓ |
| "Mark as annoying" affordance + its onboarding tooltip | — | ✓ |
| `POST /api/telemetry` (event ingestion) | ✓ | ✓ |

The last row is the design's one open write path; everything owner-only is
enforced server-side by `isOwner`, and everything tester-only is simply
not rendered when `useOwner()` is true — the owner flagging his own UI as
annoying to himself would be a strange loop; he has annotation mode.

### Session identity and profiles

`genCap.ts` already mints an anonymous per-session id in a `ghosted_sid`
cookie for the daily generation cap. Telemetry and annotations reuse it
rather than adding a second identity mechanism. It is opaque (no PII, no
device fingerprint), already scoped per-browser, and already the unit the
app uses to reason about "one visitor, today."

Capability 4 adds one careful wrinkle: a tester's local **profile**
(pseudonym, target role type — see Capability 4) exists so the owner can
tell testers apart in reports. The pseudonym is attached to a report at
send time, with the tester looking at a consent screen that lists it. It is
**never** attached to passive telemetry events — the telemetry log stays
keyed by opaque `sessionId` only. The linkage between a sessionId and a
pseudonym exists solely inside reports the tester chose to send. Passive
data stays anonymous; volunteered data is signed.

### Storage: two shapes, not one

The four capabilities need two different persistence shapes, and
conflating them would be a mistake:

- **Append-only log** (telemetry events, annotations): write-once,
  never edited, read by aggregating. Same shape as
  `generation-runs.jsonl` — `appendFile` to a `.jsonl` file in
  `.ghosted-local/`, one JSON object per line, parsed with the existing
  `parseJsonlLines` helper in `apps/web/lib/server/runStats.ts`.
- **Mutable record set** (UI extensions; incoming tester reports): create,
  read, delete — a lifecycle, not a log. UI extensions use `genCap.ts`'s
  `{ read(key), write(key, data) }` `CapStore` shape — whole-file
  read-modify-write of a small JSON array. Reports use one-file-per-record
  (`.ghosted-local/reports/<id>.json`), the same per-file precedent as
  `genCap.ts`'s `usage/<date>.json` — deletable means `unlink`, no
  tombstones in a log.

All of it lives under `.ghosted-local/`, which is already the mounted
Docker volume (`Dockerfile`: `VOLUME /app/apps/web/.ghosted-local`) —
nothing new to provision in Coolify beyond the one env var above.

---

## Capability 1 — UX telemetry

### What gets captured, and why each one earns its place

| Event | Why | Cost |
|---|---|---|
| `view` (route entered) | Which screens get used at all — the cheapest, highest-signal event. | one row per navigation |
| `funnel_step` (named steps: posting pasted → fit scored → draft generated → draft finalized → sent) | The apply flow is the product; drop-off inside it is the single most actionable number this whole plan can produce. | one row per step |
| `interaction` (click on an explicitly tagged component) | Which controls get touched — opt-in per component via a `data-telemetry-id`, not "every click on every div." | one row per tagged click |
| `rage_click` (3+ clicks within 600ms on the same tagged target) | Cheap, high-signal frustration marker; computed client-side, only the boolean fires. | rare |
| `dwell` (ms on a route before navigating away) | Distinguishes "read it, left" from "got stuck." | one row per route exit |
| `error_shown` (a user-visible error surfaced, by component id — never the message text, which can echo user input) | Errors the code handled but the user still saw; consecutive `error_shown` on the same component is the "error loop" indicator Capability 4's reports aggregate. | one row per surfaced error |
| `role_type_custom` (the custom role-type string typed after picking "other," trimmed + lowercased) | `KNOWN_ROLE_TYPES` in `packages/core/src/types.ts` has 15 presets plus write-your-own (`RoleType = KnownRoleType \| (string & {})`, entered in `CaptureForm.tsx`/`EditApplicationForm.tsx`). What people type there is the exact signal for which preset to add next — this event exists to answer that one question. | one row per custom entry saved |
| `cursor_sample` (bounded, see below) | Weakest signal of the set, but the ask explicitly wants it — scoped down so it's not a liability. | sampled, capped |

One derived (not captured) indicator worth naming now because Capability 4
leans on it: an **abandoned generation** is a `funnel_step:
'draft_generated'` with no subsequent `draft_finalized` or `sent` step in
the same session. It falls out of the funnel data for free — no extra
event type needed.

Explicitly **not** captured, ever, on any event: keystroke content, form
field values, resume/cover-letter/CV text, job posting text, contact
fields, free-text notes. `componentId` values come from an explicit
allow-list the developer adds via a `data-telemetry-id="…"` attribute —
telemetry never walks the DOM and serializes arbitrary text or labels. This
mirrors the `CLAUDE.md` restriction pattern in the sibling `ghosted` CLI
project: an explicit boundary, not a filter that might miss something.

`role_type_custom` is the deliberate, single exception to "no user-typed
strings in passive telemetry," and it gets its own event type rather than
being folded into `interaction` precisely so the exception stays auditable:
`interaction` carries only allow-listed component ids and must keep that
invariant; a dedicated type means exactly one event in the whole schema can
ever carry typed text, and anyone reading the log knows which. The posture,
stated plainly: this is a job-category label ("devops", "UX research"), not
material content — it fires only when the custom value is saved on an
application, normalized (trimmed, lowercased), and stays keyed to the
anonymous `sessionId` like everything passive; the pseudonym linkage rule
from Shared Foundations is unchanged. The honest caveat: a sufficiently
niche string ("submarine sonar technician") is weakly identifying in a
tester pool this small. That is accepted — the field's entire purpose is to
be read by the owner, and the disclosure line below names it.

### Cursor tracking — the honest version

Full `mousemove` capture is the wrong shape for this app: it's a firehose
(hundreds of events/second/user), it's mostly noise (arm drift, not
intent), and it is the one telemetry surface a non-technical tester would
find creepy if they thought about it. So: no continuous stream, no
per-pixel coordinates, no capture outside a couple of screens picked in
advance.

Proposed bounded version:

- Only active on screens wrapped in an explicit `<CursorSampled screenId="apply-generate">` boundary — starts with the `/apply` generation panel and the resume block editor, because those are the two screens this whole plan cares about improving.
- Samples on a timer (every ~400ms) while the pointer is inside the
  boundary, not on every `mousemove` event.
- Stores position as a bucket, not a pixel: `xPct`/`yPct` rounded to the
  nearest 5% of the element's bounding box, plus the viewport-size bucket
  (`mobile`/`tablet`/`desktop`). Good enough for "people hover here and
  don't click" or "nobody scrolls past this fold"; useless for
  reconstructing exact mouse paths.
- Hard cap: 50 samples per session per `screenId`. After that, silently
  stop — a screen that's been sampled 50 times has told you what it's
  going to tell you.

If this turns out to be low-value after P0 ships, the fix is deleting
`<CursorSampled>` from two files. That's the whole point of scoping it this
narrowly instead of building a heatmap pipeline up front.

### Architecture

```
apps/web/lib/useTelemetry.tsx        client hook: track(event), batches in
                                      memory, flushes via sendBeacon
apps/web/lib/server/telemetry.ts     append-only writer/reader, same shape
                                      as generationTelemetry.ts
apps/web/app/api/telemetry/route.ts  POST (open, any session) / GET (owner-only)
apps/web/app/telemetry/page.tsx      owner-only dashboard
```

`useTelemetry()` mirrors `useHosted()`'s "one hook, module-level shared
state" shape, but for writes instead of a shared fetch: it holds an
in-memory queue, flushes on a 10s timer, on `visibilitychange`, and via
`navigator.sendBeacon` on `pagehide` (beacon survives tab close; a normal
`fetch` does not). No retry logic, no delivery guarantee — this is
analytics, not a ledger; a dropped event on a closed tab is an acceptable
loss, the same way `generationTelemetry.ts` doesn't retry a failed
`appendFile`.

`POST /api/telemetry` accepts a batch (array of events), stamps `at`,
`sessionId` (from the cookie, never trusting a client-supplied one), and
`role` (`owner` computed server-side from `isOwner`, never client-claimed),
and appends each as a line to `.ghosted-local/telemetry-events.jsonl`. This
endpoint stays open to any invited visitor — testers are the ones
generating the interesting events. (Capability 4's `POST /api/reports` is
the only other tester-writable endpoint this plan adds; everything else is
owner-only.)

`GET /api/telemetry` (owner-only) returns aggregated stats, same
`readFile` → `parseJsonlLines` → pure-aggregator shape as
`app/api/runs/route.ts` → `runStats.ts`. A new `apps/web/lib/server/telemetryStats.ts`
(pure, no I/O — same contract as `runStats.ts`) computes: views per route,
top interacted components, funnel conversion + drop-off per step, dwell
percentiles per route, rage-click counts per component, and a **"custom
role types seen"** list — normalized strings ranked by frequency, so the
top of the list *is* the next-preset candidate list, no interpretation
required. It renders on `/telemetry` as one more card in the existing
`stat-grid` language.

`/telemetry` (owner-only page, gated both by `useOwner()` client-side and
by the route itself checking `isOwner` server-side via a server component
wrapper) renders that summary in the existing `stat-grid`/`card`/`rate-bar`
components `stats/page.tsx` already established — no new visual language.

### Data schema

```ts
// packages/core or apps/web/lib/telemetryTypes.ts — pure types, no I/O
export type TelemetryEventType =
  | 'view'
  | 'interaction'
  | 'rage_click'
  | 'dwell'
  | 'funnel_step'
  | 'error_shown'
  | 'role_type_custom'
  | 'cursor_sample'

export interface TelemetryEvent {
  id: string                 // crypto.randomUUID()
  at: string                  // ISO timestamp, stamped server-side
  sessionId: string            // from ghosted_sid, never client-supplied
  role: 'owner' | 'tester'      // stamped server-side from isOwner()
  type: TelemetryEventType
  route: string                 // pathname only, no query string
  componentId?: string          // from an explicit data-telemetry-id allow-list
  screenId?: string              // for cursor_sample / funnel_step scoping
  step?: string                   // funnel_step name, e.g. 'posting_pasted'
  durationMs?: number              // dwell duration
  customRoleType?: string           // role_type_custom ONLY — trimmed,
                                    // lowercased; the one field in this
                                    // schema that carries typed text
  xPct?: number                     // cursor_sample bucket (0-100, step 5)
  yPct?: number
  viewportBucket?: 'mobile' | 'tablet' | 'desktop'
}
```

### Retention

`generation-runs.jsonl` has no rotation today because generation is
low-frequency. Telemetry will not be — even with opt-in component tagging,
a handful of active testers can produce thousands of rows a week. P0 ships
with a simple guard rather than a full rotation system: the write path
checks file size before appending and, past a threshold (e.g. 20MB), moves
the current file to `telemetry-events.<date>.jsonl.bak` and starts a fresh
one — same idea as log rotation, done in five lines rather than a
dependency. The dashboard only ever reads the current file, so old data
ages out of the dashboard automatically; the `.bak` files are there if the
owner ever wants to `grep` history by hand.

### Privacy line (the part a tester should be able to read and shrug at)

Add one line to the onboarding flow (`apps/web/app/onboarding/page.tsx`)
and settings (`apps/web/app/settings/page.tsx`), dismissed-and-remembered
in localStorage like other soft prompts in this app:

> Ghosted logs anonymous usage — which screens you visit, what you click,
> how long things take. It never logs what you type, your resume, your
> cover letters, or the job posting text. One exception: if you type a
> custom role type instead of picking a preset, that category name is
> logged — it's how the preset list gets better. Occasionally it'll offer
> to send Cello a usage report; that only happens if you say yes, and you
> see exactly what's in it first.

The second sentence lands with Capability 4; until then the line ships
without it. Passive telemetry has no opt-out toggle in v1 — the volunteered
layer (reports) is consent-gated per-send instead, which is where the
consent actually matters (see open questions).

---

## Capability 2 — owner annotation mode

The owner needs a way to say "this control is in the wrong place" *while
looking at the wrong place*, without context-switching to a notes app. It
reuses the append-only shape from telemetry (an annotation is a fact that
happened at a point in time, not a record you edit into different states)
and the owner gate from above (testers never see or trigger this — it's
not a feedback widget, it's the owner's own punch list).

### Interaction

- `Cmd/Ctrl+Shift+A` toggles "annotate mode" (owner-only — the hotkey
  handler checks `useOwner()` and no-ops entirely for testers, so the
  keybinding literally does nothing on a tester's machine).
- While active, the cursor changes and clicking any element opens a small
  inline popover anchored to that element: a textarea ("what's wrong
  here?") and a save button. Esc or click-outside cancels.
- On save, the annotation captures structural context automatically — no
  typing required beyond the note itself.

### "Screenshot-ish context" without a screenshot library

An actual pixel screenshot needs `html2canvas` or a headless-browser round
trip — a real dependency, for a feature only the owner uses maybe a few
times a session. Cheaper and arguably more useful for a code-editing
audience: capture the target element's **sanitized outer HTML skeleton**
(tag names, class names, `data-*` attributes — text content stripped
entirely, since resume/cover-letter text lives in these DOM subtrees and
must never round-trip into a stored annotation) plus its bounding box and
the nearest ancestor with a `data-component` marker. The review UI
reconstructs a rough gray-box wireframe of "here's roughly the shape of
what you clicked" from that skeleton — enough to jog memory, nowhere near
enough to leak material content. If that turns out to be insufficient,
graduate to a real screenshot in a later pass (open question below).

### Architecture

```
apps/web/components/AnnotationMode.tsx    hotkey listener + popover, owner-only
apps/web/lib/server/annotations.ts        append-only writer/reader (same shape
                                           as telemetry.ts)
apps/web/app/api/annotations/route.ts     POST/GET, both owner-only
apps/web/app/annotations/page.tsx         owner-only review list
```

### Data schema

```ts
export interface UIAnnotation {
  id: string
  at: string
  route: string
  note: string                     // the owner's own text — this is the
                                    // one field allowed to be freeform,
                                    // because the owner wrote it, about
                                    // the UI, not about a candidate/job.
  targetSelector: string           // best-effort CSS selector to the clicked element
  componentId?: string             // nearest data-component ancestor, if tagged
  domSkeleton: string              // sanitized outer-HTML skeleton, no text nodes
  boundingBox: { x: number; y: number; w: number; h: number }
  viewport: { w: number; h: number }
  status: 'open' | 'done'
}
```

### Review → work items

`/annotations` lists open notes grouped by route, each with a "copy as
task" button that formats the annotation into a plain-text block shaped
like a prompt (route, note, selector, skeleton) — meant to be pasted into
Claude Code or another coding agent by the owner, the same way he already
drives this repo. This plan does **not** propose auto-dispatching an
annotation to an agent that edits source files; that's a human-in-the-loop
step on purpose (see Capability 3's option (b) discussion for why editing
real source stays a deliberate, redeployed action rather than a runtime
one). Marking an annotation `done` is a manual owner action from the same
page.

`/annotations` ships standalone in P1. When Capability 4's `/reports`
review queue lands (P3), annotations fold into it as a second source and
`/annotations` becomes a redirect — one queue, two kinds of items, rather
than two pages the owner has to remember to check. Details in Capability 4.

---

## Capability 3 — agent-editable UI ("personalized extensions")

This is the one with real architectural risk, so it gets the most scrutiny.

### Three architectures, compared honestly

**(a) Sandboxed extension slots.** Pre-defined `<ExtensionSlot slotId="…">`
mount points in a small, chosen set of components. The agent produces a
declarative JSON spec (not code) drawn from a fixed vocabulary of controls
(text field bound to a whitelisted data path, toggle, slider, select,
button that calls a whitelisted existing action). A fixed set of renderer
components turns that spec into UI. Bounded by construction: the agent can
never render something the slot's schema doesn't already allow, because
there is no code execution — only data being read by an existing renderer.

**(b) Agent edits real source files, owner redeploys.** The most powerful
option, and also the one this repo is already living proof of — the owner
already runs Claude Code against this exact codebase, on a branch, with a
build/test/redeploy loop. That's not a new "in-app agent" feature, it's
the existing workflow (`git checkout -b`, edit, `pnpm test`, PR, Coolify
redeploy). It's real, it's how this very document got written, but it's
not runtime, it's not scoped to a session, and it can't be gated to
"owner-only at request time" because it's a dev-machine action, not a
served feature. Good for structural changes; wrong shape for "quickly
expand this panel while using the deployed app on my phone."

**(c) Runtime component overrides as data.** A registry of existing
components each declaring which of their own props are "overridable"
(e.g. `ResumeBlock` declares `editable: boolean` as overridable), plus an
override document (JSON) the agent writes that sets values for those
props. Safer and smaller than (a) — no new UI vocabulary, just flipping
switches the component already has — but strictly less capable: it can't
add a control that doesn't already exist as a prop, so "let me edit this
block" only works if `ResumeBlock` already has an edit mode built in and
merely toggled off.

### Recommendation for v1: (a), deliberately narrow

(c) is tempting for its safety margin, but it can't actually deliver either
worked example below without the owner having pre-built the exact toggle
the agent would flip — which defeats the point of asking an agent instead
of just adding a settings checkbox. (b) is real and valuable but is a
workflow, not a feature to design here. (a) is the only option where "ask
the agent for a UI change" produces something new without producing
arbitrary code.

**Real scope cut for v1 — exactly two slots, not a general mechanism:**

1. `slotId: "resume-block-editor"` — mounted in `CVBuilder.tsx`/`CVReview.tsx`
   next to each resume block. Allowed controls: `inline-editor` (textarea
   or text input) bound to one of a whitelisted set of CV field paths
   already present in the CV JSON schema (`summary`, one `work[].summary`,
   one `skills[].keywords` — never an arbitrary path string).
2. `slotId: "template-generation-controls"` — mounted in the `/apply`
   generation panel alongside `GenerationStatus`/`ModelPicker`. Allowed
   controls: `toggle` and `select`, bound to generation-time parameters
   the core generation functions already accept but the UI currently
   hides — e.g. surfacing the existing revision-instruction textarea
   permanently instead of behind a click, or exposing model choice
   per-task instead of one global picker. Not allowed: inventing a
   parameter `buildGenerationPrompt` (`packages/core/src/generate.ts`)
   doesn't already accept — the agent can surface more of what's there,
   not add new generation behavior. New generation *parameters* are a core
   package change, which is architecture (b)'s job, not this feature's.

No general "add a slot to any component" mechanism in v1. Every new slot is
a manual code change (a `<ExtensionSlot>` dropped into a component by the
owner, in a normal PR) — the agent works within slots that exist, it
doesn't create them. That is the honest limitation of this recommendation:
v1 covers exactly the two requests in the prompt, and extending it to a
third screen means the owner adding a third slot by hand first.

### Lifecycle

- **Create** — owner opens the slot's "improve this" affordance (a small
  icon, owner-only, rendered only when `useOwner()` is true), types a
  request, agent returns a spec, owner previews and confirms save.
- **Edit** — same entry point when an extension already exists for that
  slot; the existing spec plus a new instruction go back to the agent
  (same shape as the existing revision flow in `generate.ts` — an
  instruction plus current state, not a blank slate).
- **List** — `/extensions` (owner-only) lists every saved extension across
  all slots, with slot id, prompt history, and a discard button.
- **Discard** — deletes the record; the slot renders nothing extra, as if
  it never existed. No soft-delete/undo in v1 — the spec is small, and the
  prompt that produced it is still visible in `/extensions` until deleted,
  so re-creating it is one request away.

### Architecture

```
apps/web/components/ExtensionSlot.tsx        the two fixed renderer sets
apps/web/lib/useUIExtensions.ts               owner-only fetch + local cache
apps/web/lib/server/uiExtensions.ts           whole-file read-modify-write
                                              (CapStore shape, not JSONL)
apps/web/app/api/ui-extensions/route.ts        GET (list) / POST (create/edit)
apps/web/app/api/ui-extensions/[id]/route.ts    DELETE (discard)
apps/web/app/api/ui-extensions/generate/route.ts  POST — the bounded agent call
apps/web/app/extensions/page.tsx               owner-only list/manage view
```

Storage: `.ghosted-local/ui-extensions.json` — a single JSON array, whole
file read and rewritten on every mutation, same as `genCap.ts`'s
`fileStore`. This is deliberately not JSONL: extensions are edited and
discarded, not appended-and-forgotten.

The agent call itself follows the exact MVI shape `generate.ts` already
established: deterministic prompt assembly (slot schema + capability list +
current spec if editing + owner's instruction) → one bounded model call →
deterministic code validates the JSON against the slot's schema before it
is ever saved or rendered. A spec that fails validation is never stored and
never rendered — same posture as `checkCoverLetter()` gating a generated
letter.

### Data schema

```ts
export type ExtensionControl =
  | { kind: 'inline-editor'; targetPath: string; label: string; multiline: boolean }
  | { kind: 'toggle'; targetProp: string; label: string; defaultValue: boolean }
  | { kind: 'select'; targetProp: string; label: string; options: string[] }

export interface UIExtension {
  id: string
  slotId: 'resume-block-editor' | 'template-generation-controls'
  createdAt: string
  updatedAt: string
  promptHistory: string[]          // every instruction that shaped this spec
  spec: {
    controls: ExtensionControl[]
    placement: 'inline' | 'below-block' | 'panel-expanded'
  }
}
```

### The agent's system prompt (draft, v1)

```
You are the Ghosted UI-extension agent. Ghosted is a Next.js 15 App Router
app (apps/web) plus a pure TypeScript logic package (packages/core), a
local-first job-application tracker deployed for one owner (Cello) and a
small set of invited testers. Voice is deadpan and dry — no marketing
language, no exclamation points, no "Great question!" Design tokens live in
apps/web/app/globals.css as CSS custom properties: warm cream/amber in
light mode, warm dark in dark mode (--bg-base, --text-primary, --accent,
--border-subtle, etc.) — never invent a new color, reference an existing
token.

You do not write code. You write ONE JSON object matching the schema
below. Nothing else — no prose before or after, no markdown fences.

You are called for exactly one slot per request. The slot tells you what
you are and are not allowed to do:

SLOT: {{slotId}}
ALLOWED CONTROL KINDS: {{allowedControlKinds}}
ALLOWED TARGETS: {{allowedTargetPathsOrProps}}   // whitelist, closed set
CURRENT SPEC (if editing, else null): {{currentSpecJson}}
PROMPT HISTORY (if editing): {{promptHistory}}
OWNER'S REQUEST: {{ownerInstruction}}

You CAN:
- Emit one or more ExtensionControl entries, each of kind
  "inline-editor" | "toggle" | "select".
- Bind a control only to a targetPath/targetProp that appears in
  ALLOWED TARGETS. If the owner's request implies a target not in that
  list, do not invent one — instead emit a spec with zero controls and
  explain in a top-level "unsupported" string field why (e.g. the field
  doesn't exist on this slot yet, or would need a code change, not an
  extension).
- Choose "placement" from: "inline" | "below-block" | "panel-expanded".
- Edit an existing spec by adding, removing, or adjusting its controls in
  light of a new instruction — you see the current spec and the full
  prompt history, so "expand it further" means building on what's there,
  not starting over.

You CANNOT, under any circumstance:
- Emit executable code, event handlers, arbitrary strings interpreted as
  JS/HTML, or any field not in the schema below.
- Reference telemetry, annotations, other users' data, or any session
  other than the fact that you are editing the owner's own view.
- Touch anything outside the slot you were called for — no new routes, no
  new API endpoints, no auth/gate changes, no server code, no changes to
  middleware.ts, no external network requests.
- Assume a target exists just because it sounds plausible — only the
  ALLOWED TARGETS list is real. Guessing a path that isn't there produces
  a runtime no-op at best and a validation rejection at worst; treat the
  list as closed.

OUTPUT SCHEMA (return exactly this shape):
{
  "controls": [
    { "kind": "inline-editor" | "toggle" | "select",
      "targetPath"?: string, "targetProp"?: string,
      "label": string, "multiline"?: boolean,
      "defaultValue"?: boolean, "options"?: string[] }
  ],
  "placement": "inline" | "below-block" | "panel-expanded",
  "unsupported"?: string
}
```

### Worked example 1 — "let me edit this block in the resume"

*Owner's request, sent from the `resume-block-editor` slot on the
work-experience summary block.*

Agent reasoning: the slot's allowed targets include `work[0].summary` (this
particular block). The request is a plain edit-in-place ask — one control,
bound to the field the block is already displaying, rendered right where
the block is.

Output:
```json
{
  "controls": [
    {
      "kind": "inline-editor",
      "targetPath": "work[0].summary",
      "label": "Edit summary",
      "multiline": true
    }
  ],
  "placement": "inline"
}
```

### Worked example 2 — "make the template generation controls more expansive"

*Owner's request, sent from the `template-generation-controls` slot on
`/apply`.*

Agent reasoning: "more expansive" with no specifics, on a slot whose
allowed targets are the generation-time knobs the panel currently hides —
model-per-task selection and a permanently visible revision-instruction
field are both already-real, currently-collapsed pieces of the app. Two
controls, not one: a select for per-task model override, a toggle to keep
the revision box open by default. Nothing about tone, word count, or
temperature — those aren't in ALLOWED TARGETS for this slot, so the agent
should not invent them, and should say so rather than silently drop them.

Output:
```json
{
  "controls": [
    {
      "kind": "select",
      "targetProp": "modelOverridePerTask",
      "label": "Model for this task",
      "options": ["default", "claude-sonnet-4-6", "gpt-5.5"]
    },
    {
      "kind": "toggle",
      "targetProp": "revisionBoxAlwaysOpen",
      "label": "Keep revision notes open",
      "defaultValue": true
    }
  ],
  "placement": "panel-expanded",
  "unsupported": "Tone/word-count/temperature aren't exposed knobs on this slot — those live in packages/core/src/generate.ts and would need a core change, not an extension."
}
```

### Worked example 3 — an out-of-scope ask, handled honestly

*Owner's request: "add a button here that emails my recruiter contact."*

Agent reasoning: no control kind in the vocabulary triggers a side effect
like sending an email, and ALLOWED TARGETS never include an action like
this — it would need a new server route and an external request, both
explicitly forbidden. The correct output is an empty control set with the
reason stated, not a best-effort button that does nothing.

Output:
```json
{
  "controls": [],
  "placement": "inline",
  "unsupported": "Sending email is a server action, not a UI extension — this would need a real feature (a route + provider), not an extension spec. Ask for this as a normal code change instead."
}
```

---

## Capability 4 — tester roles, usage reports, and the annoying-marker

Capabilities 1–3 give the owner eyes and hands. This one gives testers a
mouth — bounded, consented, and quiet. Three pieces: a local profile so
reports have a name on them, a report flow with three tiers of effort, and
a discrete "this is annoying" flag that is the tester analog of the
owner's annotation mode.

### 4.1 Tester profiles — names without accounts

The no-accounts stance holds. A profile is a small local record, same
port-interface pattern as `baselineRepo.ts` (`load`/`save`/`clear` against
one localStorage key), living and dying in the tester's browser. Its only
job is to let the owner tell "Maya, hunting for product design roles,
started in June" apart from "R., backend, started last week" when reports
arrive — without a login, a database row, or an email address.

```
apps/web/lib/testerProfileRepo.ts     port + LocalStorage/Memory impls,
                                       copy of baselineRepo.ts's shape
localStorage key: ghosted.tester-profile.v1
```

```ts
export interface TesterProfile {
  pseudonym: string            // whatever they type — "Maya", "R.", "capybara"
  roleType: string             // free text: "product design", "backend", …
  startedAt: string            // ISO date, defaulted to first save, editable
  createdAt: string
}
```

Where it's created: a small card in `/settings` (tester-visible per the
surface map), plus a one-time nudge on the report consent screen if empty
— a report with no pseudonym still sends, just labeled by a short hash of
the sessionId, because blocking a willing report on a missing nickname
would be backwards. No validation beyond non-empty trimming. Pseudonyms
are self-asserted and unverifiable — two testers can both be "Maya" — and
with a tester pool this size that is a shrug, not a bug (open question if
the pool grows).

The profile is sent **only** inside a report the tester confirmed. It is
not attached to telemetry events, not synced, not sent anywhere else.

### 4.2 Usage reports — three tiers of friction, one consent screen

**Triggers.** The prompt appears (non-blocking — a dismissible card, not a
modal) when either fires:

- **N applications actually applied.** N = 5, counting `status !== 'saved'`
  (the same "actually applied" line `packages/core/src/types.ts` draws for
  derived stats). Justification: below ~3 the tester has opinions about
  onboarding, not the product; 5 means they've been through the full
  posting → fit → generate → send loop enough times that the funnel data
  is worth reading and the frustrations are real rather than first-contact
  confusion. 10 would be safer data and half the reports — 5 is the bias
  toward hearing something.
- **The house-account daily cap hits.** The 429 from `/api/generate`
  (`genCap.ts`'s `checkAndIncrement` returning `{ ok: false }`) is the
  single strongest "this person is actually using it" signal the app has —
  and the moment they're blocked anyway, so asking costs them nothing they
  were about to do.

After a prompt is dismissed or a report is sent, the trigger re-arms at
the next multiple of N (10, 15, …) or the next cap-hit at least 7 days
later — the tester should never feel farmed. Trigger state (last prompt
date, last sent date) lives in localStorage next to the profile.

**Three tiers, all explicit on the prompt card:**

- **(a) "just send the data"** — one click. Telemetry aggregates only.
- **(b) data + a note** — the same, plus one free-text box ("what's been
  bugging you? one sentence is fine").
- **(c) data + note + the survey** — adds the six questions below. Marked
  with an honest time estimate ("~2 minutes"), because deadpan includes
  not pretending surveys are fun.

**The consent screen.** Whatever tier, before anything sends, the tester
sees the actual payload rendered as a plain list — not a summary of the
payload, the payload: each aggregate with its value ("14 sessions · 41
generations · 3 abandoned · 2 rage-clicks on apply-generate-button"), any
custom role types they typed ("custom role types: devops, ux research"),
each annoying-mark with its component id and their note, the pseudonym as
it will appear, and the survey answers verbatim. One line at the bottom
states what is structurally absent: *"No resume text, no cover letters, no
company names, no posting text — the report format has no fields for
them."* That claim is enforced by construction: the report is assembled
client-side from `TelemetryEvent` aggregates and `AnnoyingMark` records,
neither of which has a field that can hold material content. Send and
cancel, equal visual weight.

**What's in a report (and what cannot be):**

```ts
export interface UsageReport {
  id: string
  at: string                        // stamped server-side
  sessionId: string                  // stamped server-side from ghosted_sid
  profile: {
    pseudonym: string                // or `sid-${hash}` when no profile
    roleType?: string
    startedAt?: string
  }
  tier: 'data' | 'data+note' | 'data+survey'
  window: { from: string; to: string }   // what period the aggregates cover
  aggregates: {
    sessions: number
    viewsByRoute: Record<string, number>
    funnel: Record<string, number>        // step name → count
    abandonedGenerations: number          // derived, see Capability 1
    rageClicksByComponent: Record<string, number>
    errorLoopsByComponent: Record<string, number>  // 2+ consecutive error_shown
    dwellMedianByRoute: Record<string, number>
    capHits: number
    customRoleTypes: string[]              // deduped, normalized strings this
                                           // tester typed instead of a preset
  }
  annoyingMarks: AnnoyingMark[]      // schema in 4.4
  note?: string                       // tier b/c free text
  survey?: SurveyResponse             // tier c
  status: 'new' | 'reviewed'          // owner-side field, defaults 'new'
}
```

No field for material content, CV data, company names, or posting text —
deliberately unrepresentable, the same posture as the telemetry event
schema. The aggregates are computed client-side from the tester's own
event history (the client keeps a rolling local mirror of what it sent to
`/api/telemetry`, so the report doesn't need read access to the server
log — testers can never read the shared telemetry file, only their own
browser's copy).

**The survey (tier c), drafted, final wording:**

1. The cover letters: how much editing before you'd actually send one?
   *(1–5: 1 = sent as-is, 5 = rewrote most of it)*
2. Did any generated letter actually go out to a real company?
   *(yes / no / haven't sent any yet)*
3. The fit score: when it called a job a good fit, did you believe it?
   *(1–5: 1 = ignored it, 5 = trusted it enough to skip re-reading the posting)*
4. What was the most annoying thing this week? One sentence is fine.
   *(free text)*
5. Was there a moment you gave up and did something by hand instead?
   What were you doing? *(free text)*
6. Would you keep using this after the test ends?
   *(1–5: 1 = no, 5 = it's already my main tracker)*

```ts
export interface SurveyResponse {
  editingBeforeSend?: 1 | 2 | 3 | 4 | 5
  letterActuallySent?: 'yes' | 'no' | 'not_yet'
  fitScoreTrust?: 1 | 2 | 3 | 4 | 5
  mostAnnoying?: string
  gaveUpMoment?: string
  wouldKeepUsing?: 1 | 2 | 3 | 4 | 5
}
```

Every field optional — a half-answered survey sends what it has.

### 4.3 Report digestion — the owner's review queue

```
apps/web/lib/server/reports.ts           one-file-per-report store under
                                          .ghosted-local/reports/<id>.json
apps/web/app/api/reports/route.ts        POST (tester, invite-gated) /
                                          GET list (owner-only)
apps/web/app/api/reports/[id]/route.ts   PATCH status / DELETE (owner-only)
apps/web/app/reports/page.tsx            owner-only review queue
```

`POST /api/reports` validates the payload against the `UsageReport` schema
server-side (reject anything with unexpected fields — the deny-by-schema
posture again, same as `validateExtensionSpec()` in Capability 3), stamps
`at` and `sessionId`, and writes one JSON file. Per-file storage instead of
JSONL because reports have a lifecycle (`new` → `reviewed` → deleted) and
"deletable" should mean `unlink`, not a tombstone line — the same per-file
precedent as `genCap.ts`'s `usage/<date>.json`. A light rate cap (one
report per session per day, checked against existing filenames) keeps the
endpoint from being a write-amplification hole.

`/reports` is the owner's **single review queue**: incoming tester reports
and his own annotations (Capability 2), interleaved, filterable by source,
newest first. Each report renders its aggregates in the existing
`stat-grid`/`card` language, marks with their component ids, and the
survey/note verbatim. Same "copy as task" affordance annotations already
have — a report's annoying-marks paste into a coding agent prompt just as
well as his own notes do. Once this page exists, `/annotations` redirects
here (noted in Capability 2).

**Retention:** raw reports are kept until the owner deletes them —
they're small, hand-curated by consent, and the whole point. Two owner
actions: mark reviewed (PATCH) and delete (unlink, no undo). Nothing is
auto-aggregated across reports in v1; when a cross-tester rollup becomes
worth having, it's a pure function over the report files, written then,
not speculated now. If a tester asks for their reports to be deleted,
that's a manual owner action too — findable by pseudonym on `/reports`.

### 4.4 "Mark as annoying" — the tester's flag

The tester analog of annotation mode, stripped to match its audience:
non-technical people who did not sign up to file bug reports.

**Interaction.** Press-and-hold (~600ms) on any component that carries a
`data-telemetry-id` — the same allow-list Capability 1 already tags, so
"markable" and "measured" stay the same set of things, and the marker
works identically with a mouse and on a phone (the deployed app gets used
on phones; a desktop-only hotkey like the owner's `Cmd+Shift+A` would be
wrong here). On hold, a small popover: **"annoying?"**, an optional
one-line text field, a "mark it" button. That's the whole ceremony. A
brief settle-confirmation ("noted.") and gone — deliberately underplayed,
matching `GenerationStatus.tsx`'s no-theatrics posture.

**What a mark captures** — annotation mechanics minus anything that could
carry content. No DOM skeleton for testers: the owner's skeleton is
sanitized, but tester DOM subtrees hold *their* materials and the safest
sanitizer is the one that never runs. Component id, route, bounding box,
viewport, their optional note. Enough to know what and where; nothing
that can quote a resume.

```ts
export interface AnnoyingMark {
  id: string
  at: string
  route: string
  componentId: string          // from the data-telemetry-id allow-list only
  note?: string                 // their words, optional, about the UI
  boundingBox: { x: number; y: number; w: number; h: number }
  viewport: { w: number; h: number }
}
```

**Accumulate locally, ride with the next report — not immediate send.**
Marks queue in localStorage (`ghosted.annoying-marks.v1`) and go to the
server only inside a consented report. Justification: an immediate send
would bypass the consent screen this capability is built around — the
promise is "you see exactly what leaves this browser before it does," and
a fire-and-forget mark breaks that promise the first time it's made.
The costs are accepted knowingly: marks from a tester who never sends a
report never arrive, and a cleared localStorage loses pending marks. The
report prompt mitigates the first — pending marks are themselves a
trigger nudge ("you've marked 3 things as annoying — want to send them?")
alongside the N-applications and cap-hit triggers.

**The guiding tooltip.** Discoverability is the real risk for a
press-and-hold gesture, so it gets explicit onboarding: a one-time
dismissible tooltip anchored to a tagged component, shown at the start of
a tester's **third session** (session count kept in localStorage;
`ghosted_sid` plus a local "sessions seen" counter — session three because
session one is orientation, session two is retention, session three is a
person with opinions). Copy, in the house voice:

> See something annoying? Press and hold it, and tell Cello. He asked.

Dismissed once, never again (`ghosted.annoying-tooltip-dismissed.v1`).
Never shown to the owner. No pulsing dots, no product-tour framework — one
tooltip, one sentence, one lifetime showing.

**Architecture:**

```
apps/web/components/AnnoyingMarker.tsx    hold-listener + popover + tooltip,
                                           rendered only when !useOwner()
apps/web/lib/annoyingMarksRepo.ts          localStorage queue, port pattern
                                           (same shape as testerProfileRepo)
```

No new server surface — marks travel inside `POST /api/reports`.

---

Capability 4 lands as P3, not folded into P0/P1, with two deliberate
exceptions pulled forward: the **role concept** (it's just the honest name
for what P0's owner gate already is — the surface map costs nothing extra)
and the `error_shown` event type (Capability 4's error-loop indicator needs
the raw events to exist from day one; retrofitting an event type means
weeks of history without it). Everything else about Capability 4 — profile,
reports, marker — depends on P0's aggregates existing and P1's popover
mechanics being built, so sequencing it after both is the order the
dependencies already imply, not a deferral.

### P0 — telemetry core + role gate + privacy line
**Scope:** `ownerGate.ts` + `/owner-unlock`, `useOwner()`/`GET /api/config`
extension with the owner/tester role concept and the surface map above,
`useTelemetry()` hook, `telemetry.ts` writer, `POST /api/telemetry`,
`telemetryStats.ts` aggregator, `GET /api/telemetry`, `/telemetry` dashboard,
`view`/`funnel_step`/`interaction`/`dwell`/`rage_click`/`error_shown`/
`role_type_custom` events (the last hooked into the "other" path in
`CaptureForm.tsx`/`EditApplicationForm.tsx`) plus the client-side rolling
mirror of sent events (cheap now, and P3's client-assembled reports depend
on it), the two `data-telemetry-id` tags needed for the apply funnel, the
disclosure line in onboarding/settings — including its custom-role-type
exception sentence, which must ship the same day the event does.
Cursor sampling included but scoped to one screen (`/apply` generation
panel) to start.

**Follows existing patterns:** `generationTelemetry.ts` (writer shape),
`runStats.ts` (pure aggregator, unit-testable with `parseJsonlLines`),
`inviteGate.ts` (gate as a pure testable function), `stats/page.tsx`
(dashboard visual language), `useHosted.tsx` (shared-fetch hook shape).

**Rough effort:** 2–3 days. The gate and the writer are each an afternoon;
the client batching hook and getting event tagging placed sensibly across
components is the rest.

### P1 — annotations
**Scope:** `AnnotationMode.tsx` hotkey + popover, `annotations.ts` writer,
`POST`/`GET /api/annotations` (owner-only both directions), `/annotations`
review page, the DOM-skeleton sanitizer (strip text nodes, keep tag/class/
`data-*`), "copy as task" formatting.

**Follows:** the same writer/reader shape P0 already built (literally reuse
`telemetry.ts`'s append/read functions against a different file, don't
duplicate the JSONL logic) plus the owner gate from P0.

**Rough effort:** 1–2 days, mostly because it's smaller than telemetry and
inherits the plumbing.

### P2 — agent extensions v1
**Scope:** `ExtensionSlot.tsx` (fixed renderer set: inline-editor, toggle,
select — three components, not a framework), the two named slots wired
into `CVBuilder`/`CVReview` and the `/apply` generation panel,
`uiExtensions.ts` (CapStore-shaped whole-file store), the four
`/api/ui-extensions*` routes, the bounded `/api/ui-extensions/generate`
call with the system prompt above, schema validation before save (a
`validateExtensionSpec()` in `packages/core` next to `checkCoverLetter()`'s
validate-before-trust pattern), `/extensions` list page.

**Follows:** `generate.ts`'s deterministic-prompt → one-bounded-call →
code-validates-output shape, `ConnectAI.tsx`/model-picker's "owner-only
affordance rendered conditionally" pattern, `genCap.ts`'s `CapStore`
interface for the mutable-record store.

**Rough effort:** 4–6 days — the schema validator and getting the
system-prompt-to-spec pipeline reliable (retry-on-invalid-JSON, the same
lenient-parse-then-validate two-step `parseGeneration()` already does) is
the bulk of it; the two slots themselves are small once the mechanism
exists.

### P3 — tester profiles, reports, and the annoying-marker
**Scope:** `testerProfileRepo.ts` + the `/settings` profile card,
`annoyingMarksRepo.ts` + `AnnoyingMarker.tsx` (hold gesture, popover,
one-time tooltip), the report prompt card with its two triggers (N=5
applied + cap-hit 429) and re-arm logic, client-side aggregate assembly
from the local event mirror, the consent screen, the three tiers and the
survey, `reports.ts` per-file store, the three `/api/reports*` routes with
server-side schema validation and the one-per-session-per-day rate cap,
the `/reports` unified review queue absorbing `/annotations`, and the
second sentence of the disclosure line.

**Follows:** `baselineRepo.ts` (both new localStorage ports are copies of
its shape), `genCap.ts` (per-file store, and the 429 path in
`/api/generate` is literally the trigger), Capability 2's popover mechanics
(the marker is the annotation popover minus the skeleton capture),
`stats/page.tsx` (report rendering), the schema-validation posture from
P2's `validateExtensionSpec()`.

**Rough effort:** 4–5 days. The consent screen and the client-side
aggregate assembly are the real work; the marker and profile are each an
afternoon once P1's popover exists. The survey is done — it's in this
document.

---

## Open questions for the owner

(Two earlier questions resolved themselves in Capability 4: tester opt-out
posture is now answered by the consent-screen model — passive telemetry is
disclosure-only, everything volunteered is consented per-send — and the
DOM-skeleton question got sharper: testers get no skeleton at all, so it
now only concerns the owner's own annotations.)

1. **Consent-screen sufficiency.** The plan treats "disclosure line for
   passive telemetry + explicit consent for reports" as the privacy
   settlement. Is that the final posture, or do testers with personal
   materials warrant a passive-telemetry kill switch too, even at the cost
   of holes in the funnel data?
2. **Owner gate rollout.** `GHOSTED_OWNER_KEY` needs to be set in Coolify
   and the cookie set once from the owner's own browser before P0's
   dashboard is reachable at all — is that acceptable friction, or should
   `/owner-unlock` be reachable without navigating there manually (e.g. a
   one-time link)?
3. **Report cadence.** N=5 applied applications and a 7-day re-arm are
   educated guesses tuned toward hearing more rather than less. Given the
   current tester count, would you rather be prompted-at less (N=10) and
   trust the cap-hit trigger to catch the heavy users?
4. **Pseudonym trust.** Profiles are self-asserted — nothing stops two
   testers picking the same name, or one picking yours. At today's pool
   size that's a shrug; is there a pool size at which this needs a
   server-issued tester code instead (which starts to smell like accounts)?
5. **Third extension slot.** P2's recommendation is deliberately capped at
   two named slots. Which screen is the next candidate once these two
   prove out — and is "the owner adds a `<ExtensionSlot>` by hand, then the
   agent works within it" an acceptable ongoing shape, or does this need to
   grow toward a more general mechanism sooner than P2 assumes?
6. **Retention.** The 20MB rotation guard on telemetry is arbitrary, and
   reports are now kept-until-deleted. Is "whenever the file gets big" fine
   for events indefinitely, and is manual deletion enough of a retention
   policy for reports containing tester pseudonyms?
