# Ghosted v2 — Token Starter Table

> Starting values, not sacred ones. Semantic names match the Figma placeholder
> collection (`Ghosted v2 Placeholder Tokens`) so these paste straight into the
> Dark/Light modes. All text/background pairs target WCAG 2.1 AA minimum;
> flagged pairs were chosen for it — re-verify after any tweak.

## Color — semantic

| Token | Dark | Light | Notes |
|---|---|---|---|
| `bg/base` | `#181614` | `#FAF6EF` | warm near-black / warm paper |
| `bg/surface` | `#221F1C` | `#FFFFFF` | cards, rows |
| `bg/raised` | `#2A2622` | `#F3EDE2` | hover, grouped headers |
| `text/primary` | `#EDE6DA` | `#2A2520` | cream / ink — both >12:1 |
| `text/muted` | `#A39A8F` | `#6B6258` | ≥4.5:1 on base in both modes |
| `accent/default` | `#D8A657` | `#8A6120` | amber; light mode darkened for AA as text |
| `accent/hover` | `#E3B873` | `#6F4E1A` | |
| `state/ghost` | `#9A92B0` | `#6F6885` | violet-grey, spectral not alarming |
| `state/ghost-bg` | `#2A2733` | `#ECE9F2` | badge tint |
| `state/followup` | `#D8A657` | `#8A6120` | shares accent family deliberately — follow-up IS the call to action |
| `state/followup-bg` | `#332B1E` | `#F6EBD6` | |
| `state/success` | `#A9B665` | `#5E6F33` | sage; responses, interviews |
| `state/success-bg` | `#252A1B` | `#EDF2DC` | |
| `state/danger` | `#C5736A` | `#9C3F36` | destructive actions only — NOT rejection display |
| `border/subtle` | `#332E29` | `#E5DCCE` | barely-there; spacing separates |
| `border/focus` | `#D8A657` | `#8A6120` | 2px, always visible — a11y non-negotiable |

Rejection/closed rendering uses `text/muted`, never `state/danger` — rejection
is a data point, not an alarm (interview §20).

## Type

| Token | Value |
|---|---|
| `font/ui` | Geist Sans, system-ui fallback |
| `font/data` | Geist Mono — dates, counts, statuses, badges, stat numbers |
| `font/display` | Newsreader (italic) — **landing page only**, never in-app |
| `size/xs..xl` | 12 / 14 / 16 / 20 / 28 (px; 16 is body, phone-first) |
| `leading` | 1.5 body, 1.2 display |
| `weight` | 400 / 500 / 650 — no light weights on dark bg |

## Spacing, radius, motion

| Token | Value |
|---|---|
| `space/*` | 4-base scale: 4, 8, 12, 16, 24, 32, 48 |
| `radius/control` | 6px (inputs, buttons) |
| `radius/badge` | 4px |
| `radius/card` | 8px |
| `motion/fast` | 150ms ease-out (hover, toggles) |
| `motion/move` | 200ms ease-out (list exits, undo bar) |
| `motion/earned` | 450ms — reserved exclusively for the ghost badge drifting away when a response clears it |

## Next step

Paste these into the existing Figma placeholder collection (23 vars, Light/Dark
modes already scaffolded), then bind the four COMPONENT_BRIEF components to
them. No component ships with a raw hex.
