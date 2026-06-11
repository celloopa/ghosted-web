# M3 UI Build Checklist

Pre-flight (done / owned):
- [x] Voice strings v1 — interview §4
- [x] Token values — TOKENS.md
- [x] Component brief — COMPONENT_BRIEF.md
- [x] Capture flow decided — single quick form + optional URL
- [x] packages/core M1 tested & green (UI never precedes tested core)
- [ ] Tokens pasted into Figma placeholder collection (mechanical, ~20 min)
- [ ] M2 Supabase project + RLS tests green (M3 ships against real auth)

Build order (each item: component test first, then implement):
- [ ] Token CSS variables (dark+light) generated from TOKENS.md — single source
- [ ] StatusBadge + derived badges render from `isGhosted`/`needsFollowUp` output (component test: fixture app → 👻 shown; response event → gone)
- [ ] Capture form — ≤7 fields, role_type chips, validates via core types, 30s on a phone
- [ ] ApplicationRow + status-grouped list, closed group collapsed
- [ ] Record-response action clears ghost badge with `motion/earned` (E2E: mark response → badge clears, no status edit)
- [ ] Detail timeline from events[]
- [ ] Today view: follow-ups due → fresh ghosts → recent responses; empty state = relief + door
- [ ] Stats screen calls `computeStats` directly — zero reimplementation (fixture parity test)

Definition of done per behavior: failing test existed first; passes; no
skipped tests; RLS tests still green.
