# Ghosted v2 — Figma Component Brief (M3 prep)

> Build these four components in `01 Components`, bound to the token
> collection (TOKENS.md values), before any screen assembly. Order matters —
> each builds on the last. Every variant gets dark+light via modes.

## 1. StatusBadge

The product model made visible: manual statuses are *facts*, derived states
are *judgments the system computed*. They must never look like the same kind
of thing.

**Variants**
- `kind=manual` × `status=saved|applied|interviewing|offer|closed`
  - Geist Mono, `text/muted`, no background, no glyph. Quiet.
- `kind=derived` × `state=ghosted|followup`
  - Glyph prefix (👻 / ⏰) + tinted bg (`state/*-bg`) + colored text (`state/*`)
  - `radius/badge`, padding 2×6
- `size=sm|md` (sm for list rows, md for detail header)

**States**: default, with-tooltip (tooltip carries the §4 voice strings).
**Rule**: derived badges are never interactive-looking; tapping opens an
explainer, never a "clear" action.

## 2. ApplicationRow

Mobile-first list row (the board variant, if testing demands one, derives
from this — not vice versa).

**Anatomy**: company (`text/primary`, 500) · position (`text/muted`) ·
StatusBadge(manual) · StatusBadge(derived, 0–2) · days-since-last-event
(Geist Mono, right-aligned).

**Variants**: `state=default|ghosted|needs-followup|closed`
- ghosted/followup: derived badge present, row otherwise unchanged (no full-row tinting — calm urgency)
- closed: 60% opacity, sorts into collapsed group
**States**: default, pressed, swipe-action (`log response` — sage)
**Sizes**: phone (stacked, 2-line) and desktop (single-line grid)

## 3. TimelineEvent

**Variants**: `type=applied|response|interview|follow_up|note` × `corrected=false|true`
- applied: neutral anchor dot, mono date
- response: sage dot — first-response instance carries the one `motion/earned` moment
- interview: sage dot, filled
- follow_up: amber dot
- note: smallest, `text/muted`, no dot emphasis
- corrected=true: strikethrough detail + "logged in error" caption — visible, never deleted

**Anatomy**: dot/glyph · date (Geist Mono) · detail text · optional correction caption.
Day-grouped, reverse-chronological. Rejection events render in plain
`text/primary` — no `state/danger`, no theater.

## 4. StatBlock

**Anatomy**: takeaway line (Geist Sans, `text/primary` — the headline, not the number) ·
big number (Geist Mono) · `n=` caption (`text/muted`) · optional mini-bar.

**Variants**: `data=ok|low` 
- `low` (group n < 5 applied): renders "2 of 3 replied" counts, muted bar,
  low-data voice string. Never a confident percentage.
**Rule**: no stat renders without its takeaway line. If you can't finish
"so I should…", the stat doesn't ship (design principle 4).

---

## Assembly order after components

1. Today (uses Row + derived badges + the celebration moment)
2. Capture form (role_type chips spec'd in interview §12)
3. Applications list (grouping, closed-recede)
4. Detail (TimelineEvent)
5. Stats (StatBlock grid)
6. Landing (Newsreader display + real screenshot — last, when there's truth to show)
