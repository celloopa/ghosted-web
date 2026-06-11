# Ghosted v2 — Starting Design Brief

> The one-page synthesis of [DECISION_INTERVIEW.md](DECISION_INTERVIEW.md).
> This is the file to read before any design or UI session.

## Product feeling

Ghosted should feel: **like the calm one in the room** — deadpan, candid,
steady; lamplight-warm dark; it does the bookkeeping so a depleted person can
act deliberately in five minutes.

It should not feel: chipper, corporate-empathetic, gamified, clinical, or like
it's mocking anyone's search.

## Voice

Humor lives in: landing, empty states, ghost badge (light), follow-up nudge (light).
Humor is banned from: stats, rejection/closed flows, errors, auth.
Jokes target the void and the process — never the user.

10 core strings to refine: see interview §4. Headliners:
- Tagline: **"Silence, measured."**
- One-liner: "Ghosted turns the silence of your job search into data and next actions."
- Ghost tooltip: "No response in 14 days. Officially a ghost. It's them, not you."

## Visual direction

- **Theme:** system, dark designed first; light is a finished sibling, not an inversion
- **Color:** warm dark — charcoal + cream + amber accent; ghost = violet-grey; success = sage. Exact values: [TOKENS.md](TOKENS.md)
- **Type:** Geist Sans (UI) + Geist Mono (data/badges); Newsreader italic on landing only
- **Spacing/radius/motion:** 4px base, 4–6px radii, 150–200ms ease-out, one earned motion moment (ghost badge drifts away on response)

## Product decisions

| Decision | Call |
|---|---|
| Today as home | **Keep.** Empty state doubles as onboarding. Re-test weekend 2. |
| Capture flow | **Single quick form**, optional URL field derives source. No paste-first step. ≤7 fields. |
| Role type UX | **Required chips with example subtitles.** Inference is P2, pre-select only. |
| Board vs list | **Hypothesis: status-grouped list** (phone-first, badges lead). Test against board weekend 2. |
| Stats low-data rule | Groups with **< 5 applied** show counts, not rates. |
| Events | **Append-only with corrections** ("logged in error" flag, nothing vanishes). |
| Ghost threshold | Fixed 14d (PL-decided). Follow-up cadence 7d. |

## Components to design first

1. Status badge (manual) + derived badge (👻/⏰) — the manual/derived distinction IS the product model made visible
2. Application list row (mobile-first) 
3. Event timeline item (all 5 event types + correction state)
4. Stat block (number + n + takeaway line, with low-data state)

## Evidence to capture

1. Events → derived-states diagram (in Figma, `07 Case Study Assets`)
2. TDD receipt: [TDD_RECEIPT.md](TDD_RECEIPT.md)
3. Own anonymized funnel stats after 2 weeks of real use

## Open questions for usability test (weekend 2)

1. Board vs list default — watch triage behavior, don't ask preference
2. Does Today-as-home survive contact with first-run and heavy-triage days?
3. Do role_type chips get accurate classification without hesitation?

## Ecosystem note

Doc generation (cover letters, resume adjustments, application-question
answers) deliberately stays **out** of the web product — it lives in the local
`ghosted2` CLI (`~/Documents/code/ghosted2`), which already does
URL → tailored docs → questions via the claude CLI. The P2 "sync bridge" =
`ghosted2 list --json` → v2 JSON import, which `parseV1Import` already accepts.
