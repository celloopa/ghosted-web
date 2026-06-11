# Ghosted v2 — Design Doc

Owner: Cello (design + build) · Product lead: Claude · Status: living document, v0.2
Companion to GHOSTED_V2_PLAN.md (build plan). This doc owns *why it should
feel this way* and *what story it tells*. Sections originally marked
[YOUR CALL] have been answered in [DECISION_INTERVIEW.md](DECISION_INTERVIEW.md) —
this doc records the problems and constraints; the interview records the
solutions.

---

## 1. Product Story (the spine — for the product AND the case study)

**Act 1 — The void.** Job seekers send applications into silence. The
emotional core isn't rejection — it's not knowing. Spreadsheets rot because
they demand bookkeeping exactly when motivation is lowest.

**Act 2 — The insight.** You can't fix silence, but you can measure it and act
on it. If the system records events (applied, response, interview, follow-up)
instead of asking users to maintain statuses, then the painful states —
ghosted, needs-follow-up — compute themselves. The tool does the bookkeeping;
the human does the follow-up.

**Act 3 — The product.** A tracker that tells you two things a spreadsheet
never will: where your funnel actually breaks (by role type, source, resume
version) and what to do today (who to nudge, what's gone quiet). Built by
someone living the problem, instrumented on his own job search first.

One-line positioning: **Ghosted turns the silence of job searching into data
and next actions.**

This three-act structure is also the case study outline. Every design decision
below should be traceable to Act 2's insight — that traceability IS the case
study.

## 2. Audience & Tone

Primary user: active job seekers, weeks-to-months into a search, motivation
eroding. They are checking this daily in a low mood. Secondary: the owner —
the stats screen must support real career decisions.

Voice: v1's gallows humor ("for the perpetually ghosted", 👻, "built with
tears and mass rejection emails") is the brand's best asset — it says *we
know, we're in it with you*. Constraint: humor about the situation, never
about the user; the product must never feel like it's mocking a fresh
rejection.

→ Voice system decided: interview §2–4 (where humor lives/banned + 10 strings).

## 3. Design Principles (decision filters)

1. **Record events, derive meaning.** The user states facts ("they replied Tuesday"); the system computes judgments (ghosted, stale, needs follow-up). Never ask the user to maintain a judgment.
2. **Thirty seconds, standing up.** Capturing an application must work in a hallway after an interview, on a phone, in under 30 seconds. Every added field fights this.
3. **Calm urgency.** Surface what needs action today without anxiety mechanics — no red badges screaming, no streaks, no guilt. The user is already stressed; the product is the calm one in the room.
4. **The chart answers a question.** Every stat visible must complete the sentence "so I should…". Vanity metrics (total applications sent) are banned from the default view.
5. **Honest states.** Ghosted is shown plainly, with dark warmth, not euphemism ("no response in 14 days" + 👻). Naming the thing is the brand.

## 4. Information Architecture

```
Landing (logged out)        → story, humor, one CTA
└─ App
   ├─ Today        (default view: follow-ups due, fresh ghosts, recent responses)
   ├─ Applications (board or list of all, filter by status/role_type/source)
   │   └─ Detail   (event timeline + facts + notes)
   ├─ Stats        (funnel breakdown — the "so I should…" screen)
   └─ Settings     (import/export, account, ghost threshold later)
```

Product-lead note: **Today — not the board — is the home screen.** The board
is inventory; Today is action. This is the single biggest UX departure from
every competing tracker, and the case study's clearest "design decision with
rationale."

## 5. Screen Briefs

Design problems and constraints; solutions in interview §14–17.

- **5.1 Today** — answer "what should I do right now?" in one glance, then get out of the way. Zero data entry beyond one-tap event logging; the empty state should feel like relief, not absence.
- **5.2 Capture** — principle 2. Company, position, role_type, status; everything else progressive disclosure. role_type UX is load-bearing (powers all stats value).
- **5.3 Applications** — inventory and triage. Derived badges must never look user-set; must work on a phone; closed recedes without disappearing.
- **5.4 Detail/Timeline** — the truthful history; timeline is the hero, facts secondary; logging ≤ 2 taps. This screen carries the architecture story visually.
- **5.5 Stats** — "where does my funnel break, and what do I change?" Each chart pairs with a plain-language takeaway; honest with small n.
- **5.6 Landing** — convert a fellow ghosted soul in one screen; real screenshot only; link back to cello.design.

## 6. Visual Identity

Decided in interview §5–9 + [TOKENS.md](TOKENS.md): warm dark designed first,
system theme; Geist Sans/Mono + Newsreader display (landing only); the 👻
ghost is the mascot of the derived state, not the logo. WCAG 2.1 AA contrast
minimum. Tokens documented before screens — the token set is the
design-systems portfolio artifact.

## 7. Telling the Story (runs parallel to the build)

Capture as you go:
- Before/after of the product model (8 manual statuses → events + derived states) as one diagram — in Figma `07 Case Study Assets`
- Screenshot of the first failing test → passing test — [TDD_RECEIPT.md](TDD_RECEIPT.md) ✅
- Own funnel stats, anonymized, once real data flows
- Usability test clips/quotes and the one design change shipped from findings
- Token sheet and voice strings

Publishing: build-in-public thread per milestone on Bluesky; case study on
cello.design using the three-act spine; resume bullet once shipped.
Constraint: **no polishing the case study before the MVP works.**

## 8. Working Agreement

- Cadence: review at each milestone (M1–M4, then weekend-2 items).
- Decision rights: Cello owns design solutions and code; product lead owns scope/sequence and names tradeoffs; disagreements resolve toward "what gets interviews faster."
- Standing question at every review: **did this week serve the job search?** Ghosted is leverage, not refuge.

## 9. Decisions Log

| # | Decision | Status |
|---|---|---|
| 1 | Voice system + 10 core strings | **decided** — interview §2–4 (refine in product) |
| 2 | Visual tokens (color/type/spacing, dark+light) | **decided** — TOKENS.md (starting values) |
| 3 | Board vs list default | **hypothesis: list** — usability test weekend 2 |
| 4 | Capture flow shape | **decided** — single quick form + optional URL (interview §11) |
| 5 | Ghost threshold fixed at 14d for v1 | decided (PL) |
| 6 | Today as home screen | decided — challenge only if testing disagrees |
| 7 | Events append-only with corrections | **decided** — interview §16 |
