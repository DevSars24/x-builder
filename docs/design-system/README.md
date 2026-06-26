# Design System

The UI vocabulary for the overlay. The source of truth is **code**, not this folder: the v2 primitive library lives in `overlay/src/ui/v2/`, and the visual tokens live in `overlay/src/neon-sheet.ts` (the "Aurora Glass" neon token sheet seeded onto the overlay shadow `:host`) + `overlay/src/design-tokens.ts` + `overlay/src/ui/v2/tokens.ts`.

> **History.** This folder originally specced a dense SPA workbench (an `AppShell` + sidebar-nav web studio). That SPA was removed in the overlay pivot, and its multi-file design-system artifacts (foundations, screens, patterns, tokens.css, HTML specimens, validation report) were deleted. What survives is [Product Components](./product-components.md) — kept for the per-component **standard** (the checklist every primitive should define), not as a literal screen inventory. The token references in it point at the removed `product-tokens.css`; the live tokens are the overlay sheets named above.

## Where things are now

| Concern | Source of truth |
|---|---|
| Primitive components | `overlay/src/ui/v2/` — `alert`, `badge`, `button`, `empty-state`, `icon-button`, `input`, `key-value-list`, `score-bar`, `select`, `skeleton`, `switch` |
| Visual tokens (neon / Aurora Glass) | `overlay/src/neon-sheet.ts` (shadow `:host` seed) |
| Base design tokens | `overlay/src/design-tokens.ts`, `overlay/src/ui/v2/tokens.ts` |
| Overlay affordances (composed UI) | `overlay/src/compose/`, `overlay/src/judge/`, `overlay/src/highlight/`, `overlay/src/settings/`, `overlay/src/provenance/` |

The primitives are **self-contained and shadow-DOM-portable** — styles are injected into the overlay shadow root, not into global CSS (the overlay is isolated and x.com has no `:root` design tokens). New hardcoded colors, shadows, and gradients are not allowed; consume tokens.

## Component standard

Every reusable primitive should still define what [Product Components](./product-components.md) lays out: purpose, when to use/avoid, props/data contract, the full state set (default, hover, active, focus, disabled, loading, selected, empty, error, partial), and accessibility (role, label, focus, keyboard, live region if dynamic).

## Accessibility baseline

- Icon-only buttons require labels and tooltips.
- Score bars include text values and never rely on color alone.
- Dynamic judge/generation results use `aria-live="polite"`; errors `aria-live="assertive"`.
- Keyboard focus must be visible.

## Copy rules

- Deterministic scores are a **heuristic second read, not a prediction** of real reach.
- LLM output is attributed to the selected provider — "Codex judge" / "Claude judge" / "Cursor judge" (`judgeProviderLabels` in shared) — never raw-LLM jargon.
