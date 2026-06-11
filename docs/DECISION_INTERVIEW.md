# Ghosted v2 — Decision Interview (completed)

> Completed 2026-06-11 by Claude, acting design lead, on Cello's delegation
> ("make the design decisions"). Every answer is a real decision with a
> rationale — overrule any of them by editing this file; downstream docs
> (STARTING_BRIEF, TOKENS, COMPONENT_BRIEF) trace back here.

## 0. Opening constraint

Three warning signs Ghosted has become a distraction from the job search:

1. A week passes with commits but zero new applications sent.
2. Tokens/visuals get a third revision before any screen has shipped.
3. Case-study writing starts before a stranger has used the MVP.

Counter-rule — Ghosted is allowed to take time only when it helps me:

- Ship a screen I will use in my own search that same week.
- Produce a case-study artifact as a byproduct of real building (not instead of it).
- Reduce the friction of actually applying (capture, follow-up, targeting).

---

## Part 1: Emotional register

### 1. The user's state

Opening Ghosted after 3 weeks of silence, they feel: **tired, numb, avoidant**.

> Ghosted should make this person feel less **powerless** and more **deliberate**.

Not "motivated" — that's a productivity-app fantasy. Deliberate is achievable
in a 5-minute session: one nudge sent, one ghost named, done.

### 2. Humor boundary

| Surface | Humor |
|---|---|
| Landing page | **yes** — full voice, it's the brand pitch |
| Empty states | **yes** — this is where warmth matters most |
| Ghosted badge | **light** — deadpan naming, never a punchline at the user |
| Follow-up nudge | **light** — dry encouragement, no exclamation marks |
| Stats screen | **no** — the data is the deadpan; jokes undermine trust in numbers |
| Rejection/closed flow | **no** — never joke near a fresh rejection |
| Error messages | **no** — be the calm one in the room |
| Account/auth | **no** — boring is correct here |

The product can joke about: **the void, ATS black holes, corporate silence,
the absurdity of the process itself.**

The product must never joke about: **the user's effort, qualifications, pace,
or any specific rejection.**

### 3. Voice anchors

Voice: **deadpan** (states absurd things plainly), **candid** (names ghosting
without euphemism), **steady** (same register on good days and bad).

Anti-voice — Ghosted should not sound: **chipper** (no 🎉-energy),
**corporate-empathetic** ("we're sorry to hear that!"), **motivational-poster**
(no "you've got this!").

### 4. Core strings (v1 drafts — refine in product, not in docs)

| Moment | String |
|---|---|
| Empty Today state | "Nothing needs you today. The follow-ups are sent, the ghosts are counted. Go be a person." |
| Ghosted badge tooltip | "No response in 14 days. Officially a ghost. It's them, not you." |
| Follow-up nudge | "Quiet for 7 days. One short nudge — the silence can't get worse." |
| Response logged moment | "Contact. The void blinked." |
| Low-data stats state | "Too few applications to read a trend yet. The chart fills itself — keep going." |
| Add application CTA | "Add application" — deliberately plain; capture is sacred, no cleverness in the critical path |
| Closed/rejected confirmation | "Closed. Logged and counted." — no joke, per §2 |
| Import success | "{n} applications imported — ghosts and all." |
| Landing one-liner | "Ghosted turns the silence of your job search into data and next actions." |
| Product micro-tagline | "Silence, measured." |

---

## Part 2: Visual direction

### 5. Physical scene

> A person uses Ghosted while **in bed at 11pm after another no-reply day**,
> on **a phone**, feeling **depleted**, with only **five** minutes of energy.

Theme decision: **system theme, dark designed first.** Dark is the emotional
home (late-night, low-mood honesty); light must be genuinely finished, not an
inversion pass — daytime triage at a desk is the second-most-common scene.

### 6. Terminal v1 inheritance

Survives (exactly 4):
- **mono type for data** (dates, counts, statuses — credibility + scanability)
- **blunt status naming** ("ghosted", not "awaiting response")
- **lo-fi ghost humor** (the 👻 stays, scoped to the derived state)
- **minimal chrome** (no cards-in-cards-in-cards; content is the interface)

Left behind:
- ASCII/terminal literalism (green-on-black, box-drawing characters)
- CLI density as a default (web earns whitespace; density is a list-view option)
- The 9-status taxonomy and any UI that asks the user to maintain judgments

### 7. Color temperament

**Warm dark** — charcoal with a warm undertone, muted amber accent, cream text.

Why it fits: the user arrives depleted; cold zinc/slate reads clinical and
slightly punitive. Warm dark says "lamplight," not "server room." It also
inherits v1's gruvbox-adjacent warmth (#D8A657 amber), so the brand evolves
instead of rebooting. The ghost state gets its own temperament: a desaturated
violet-grey — spectral, soft, unmistakably *not* an error red.

### 8. Type temperament

Closest feel: **candid personal tool.**

Type decision: **mostly sans with mono data.**
- UI: **Geist Sans** (free, variable, Next-native)
- Data/badges/numbers: **Geist Mono** (already in Cello's library)
- Landing display only: **Newsreader italic** — one editorial note, a nod to
  the visual-journalism background, never inside the app.

### 9. Token starting point (direction → exact values in TOKENS.md)

| Token | Should feel |
|---|---|
| Background | warm near-black; lamplight, not void |
| Surface | one quiet step up; visible without borders doing the work |
| Text | warm cream, high contrast; muted text still AA |
| Accent | amber; reserved for primary actions and follow-up urgency |
| Ghosted state | violet-grey, spectral, calm — never alarm-colored |
| Follow-up state | amber family — "calm urgency" is literally this token |
| Success/response | sage green, quietly celebratory |
| Borders | barely-there; spacing does the separating |
| Radii | small (4–6px) — tool, not toy |
| Spacing | 4px base; roomier on phone than desktop instinct suggests |
| Motion | 150–200ms ease-out, almost none; one earned moment — the ghost badge drifts away when a response clears it |

---

## Part 3: Product structure decisions

### 10. Today as home

For: (a) the daily session is 5 depleted minutes — Today requires zero
decisions; (b) action beats inventory: every competing tracker opens on a
board nobody updates; (c) it's the clearest embodiment of "record events,
derive meaning" — the system did the triage overnight.

Against: (a) first-run is empty — needs a designed empty state that routes to
capture; (b) heavy-triage days want the list; (c) if nudge quality is poor,
the home screen is noise you can't skip.

**Stance: keep Today as home.** Mitigate (a) with the empty state doubling as
onboarding ("Add your first application — we'll take it from there"), (b) with
one-tap nav to Applications. Re-examine only if weekend-2 usability tests show
users routing around it.

### 11. Capture flow

**Decision: single quick form with an optional URL field — no paste-first step.**

Visible fields (7 max): company, position, role_type (chips), saved/applied
toggle, job URL (optional — silently derives `source`), date applied (defaults
today, shown only when "applied"), notes (collapsed disclosure).

Why: paste-first adds a screen to the 30-second budget and creates a silent
dependency on parsing quality (v1's scraper lesson). URL-in-form gets the
source data without gating on it. Autofill-from-URL upgrades this form later
(P2) without changing its shape.

Fails if: role_type chips cause hesitation (watch in testing); mobile keyboard
thrash between fields (order fields text→text→tap→tap); people paste URLs
into "company" (placeholder copy must preempt).

### 12. Role type UX

**Decision: required chips with example subtitles.** Four taps max, no
dropdown. Inference-from-title is P2 and only ever pre-selects, never locks.

| Chip | Subtitle |
|---|---|
| Design Engineer | "design engineer, UX engineer, creative technologist" |
| Product Designer | "product, UX, interaction design" |
| Brand / Motion | "brand, visual, motion, marketing design" |
| Other | "everything else — still counts" |

Required because the entire stats screen is downstream of this field; chips
with examples make accuracy the path of least resistance.

### 13. Board vs list

Board is better if: drag-to-status feels meaningful on desktop; the funnel
shape itself motivates; n is small enough to see whole columns.

List is better if: primary device is a phone (it is — §5); n grows past ~30;
derived badges (👻 ⏰) are the real signal and need a column-free layout;
closed items should recede by sorting rather than by column-hiding.

Mobile probably wants: **list, grouped by status, derived badges leading.**

> **Hypothesis: start with a status-grouped list because the phone-in-bed
> scene is primary and badges are the signal, but test against a board with
> the weekend-2 testers.** (Decision #3 stays evidence-owned.)

---

## Part 4: Screen-by-screen intent

### 14. Today

- First thing: follow-ups due (actionable, one-tap "logged it")
- Second: newly ghosted (acknowledgment, with "follow up anyway / let it go" actions)
- Visually quiet: responses received (good news doesn't need urgency styling — it gets the one motion moment instead)
- Empty state should feel like: **relief with a door** — "nothing needs you" + a quiet path to add/review
- "Logged follow-up" moment: instant, undoable, zero-confirmation — the item slides out, a one-line undo lingers

### 15. Applications

- For: inventory, triage, finding one specific application fast
- Not for: deciding what to do today (that's Today's job)
- Closed applications: collapse into a summarized group at the bottom — countable, never deleted, never loud
- Derived badges: prefix glyphs (👻 ⏰) + tint, visually distinct from the status word so they never read as user-set
- Filters that matter: status, role_type, ghosted-only
- Filters that can wait: source, salary, date ranges, search-as-filter

### 16. Detail / timeline

- The timeline should prove: **the system remembers so you don't have to** — every fact has a date, every judgment traces to events
- Fastest event to log: response (one tap from anywhere the app is shown)
- Facts live: in a quiet sidebar/header block — secondary to the timeline
- Notes should feel: like margin notes, not a document editor
- Corrections: **append-only with corrections** — events can be marked "logged in error" but never vanish; invariants stay simple and the history stays honest (resolves the open engineering question)

### 17. Stats

Every chart completes "so I should…":

- Response rate by role_type, so I should: **stop applying to the role type that never replies and double down where I'm wanted**
- Interview rate by role_type, so I should: **see where I convert past the screen — targeting ≠ just response**
- Response rate by source, so I should: **drop the job boards that eat applications**
- Resume version performance, so I should: **kill the underperforming resume, iterate the winner**
- Time to first response, so I should: **calibrate when silence is actually a ghost (and tune my follow-up timing)**

Low-data rule: **a group with fewer than 5 applied applications shows counts,
not rates** ("2 of 3 replied" not "67%"), with the low-data string from §4.
No confident bars from 3 data points.

---

## Part 5: Component starting brief (full spec in COMPONENT_BRIEF.md)

### 18. Status badge

- Manual statuses: quiet text labels, mono, neutral — they're facts
- Derived states differ by: glyph prefix + tinted background + tooltip explaining the rule — they're *judgments the system made*
- Ghosted badge: 👻 + violet-grey tint, deadpan tooltip
- Follow-up badge: ⏰ + amber tint, action attached
- Badges must not feel: like errors, like blame, like something the user must clear to be "done"

### 19. Application card / list row

- Most important: company
- Second: position
- Visible metadata: status, derived badges, days-since-last-event (mono)
- Hidden until detail: salary, location, URL, notes, full timeline
- Primary action: open detail
- Secondary: log response (the one event worth a shortcut from the row)

### 20. Event timeline item

- Organized by: reverse-chronological, day-grouped
- Distinct treatments: response (sage), interview (sage+), follow_up (amber), applied (neutral anchor), note (quietest)
- Most celebrated: first response — the single motion moment lives here
- Most sensitive: closed/rejected — plain typography, no color theater
- Never over-dramatized: rejection. It's a data point, render it like one.

### 21. Stat block

- Must include: the number, the n it's built on, and a plain-language takeaway line
- Takeaway line sounds: deadpan-direct — "Design-engineer applications get replies 3× as often. Aim there."
- Small samples: counts not rates (§17), muted styling, never error styling
- Charts avoid: 3D anything, gradients-as-decoration, axes that don't start at zero, vanity totals

---

## Part 6: Portfolio / case-study framing

### 22. The design claim (primary)

**"I transformed manual status tracking into an event-driven product model."**

The emotional-reality framing (§2–3) is the supporting voice of the case
study, not the claim — the model change is the demonstrable, transferable
design decision a hiring panel can evaluate.

### 23. Evidence

- Artifact 1: the events → derived-states → stats diagram (already in Figma, `07 Case Study Assets`)
- Artifact 2: TDD receipt — first failing test → passing (captured in repo, `docs/TDD_RECEIPT.md`)
- Artifact 3: own funnel stats, anonymized, after 2 weeks of real use
- Metric/result: owner's interview rate by role_type after retargeting
- Usability finding to capture: the board-vs-list session + the one shipped change from it

### 24. What reviewers should notice

A hiring manager should see that I can: **identify the real problem under a
feature list (silence, not statuses) · cut scope ruthlessly against a goal ·
ship and instrument my own product decision.**

A product/design-systems team should see that I can: **design a data model as
a UX act · build a token system with semantic derived-state colors from day
one · write the tests that pin product behavior before UI exists.**
