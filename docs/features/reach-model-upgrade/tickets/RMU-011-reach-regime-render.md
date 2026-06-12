---
status: todo
---

# RMU-011: Four-regime prediction render (`ReachRegimeBlock`)

## Implementation Details

Render the four-regime output by extending `EngagementPredictionCard` in a
backward-compatible, feature-detected way. The existing Range / Midpoint / Confidence rows
and signals list stay exactly as-is (fed by the server-derived legacy fields).

1. **`ReachRegimeBlock`** (new):
   ```ts
   type ReachRegime = {
     pEscape: number;                  // 0..1 (from escapeProbability)
     stallRange: { low: number; high: number };
     escapeRange: { low: number; high: number };
     expectedReplies: number;
     qualityBasis: "static" | "judge"; // server-supplied
   };
   ```
   Renders a labeled group: "Escape likelihood" → `pEscape` as a percentage with a
   `Badge variant="info"`; "Typical reach" → `stallRange.low – stallRange.high`; "If it
   breaks out" → `escapeRange.low – escapeRange.high`; "Expected replies" → `expectedReplies`.
   When `qualityBasis === "judge"`, render a single `Badge variant="accent"` "Refined with
   judge signal"; `"static"` (or absent on a legacy payload) → no badge. **No second
   prediction, no delta, no diff is rendered.**
2. **`EngagementPredictionCard`** — feature-detect `pEscape`: render the regime block below
   the existing rows only when the new fields are present. Existing/legacy/disabled branches
   unchanged.
3. **`predictionSummary`** (chip in `CandidateDeterministicSummary`) — when `pEscape` is
   present, append `· {pct}% escape` to the existing string; when absent, return the exact
   current string (byte-identical).

## Data Models

CONSUMES the extended `availableEngagementPredictionSchema` (RMU-001): `escapeProbability`
(rendered as `pEscape`), `stallRange`, `escapeRange`, `expectedReplies`, `qualityBasis`. The
client reads the existing `rangeLow`/`rangeHigh`/`midpoint` for the legacy rows — there is no
separate `combined` field. Producer: RMU-006 (static) / RMU-008 (judge).

## Integration Point

The three existing prediction call sites — `DraftDeterministicEvaluation`,
`DeterministicDetailInspector`, and the chip via `CandidateDeterministicSummary`. No new
mount. User sees escape likelihood, typical + breakout ranges, and expected replies after a
draft is scored.

## Scope Boundaries / Out of Scope

Render only. Does NOT set `qualityBasis` (server-supplied; the refine flow that produces a
`"judge"` value is RMU-013). Disabled-prediction branch unchanged. Zero-trace: no diff/delta
UI, no before/after pair.

## Test Strategy & Fixture Ownership

Component. Owning suite: writer `deterministic-components` tests. Fixture: a
`buildAvailablePrediction()` builder including `pEscape`/`stallRange`/`escapeRange`/
`expectedReplies`/`qualityBasis` (test-owned, shared). In-process SSR.

## Definition of Done

Regime block renders from the new fields; legacy + disabled payloads render unchanged;
summary chip additive; `pnpm test` + `pnpm typecheck` green.

## Acceptance Criteria

- Given an available prediction with `pEscape=0.12`, stall `[800,2400]`, escape `[6000,40000]`, replies `9`, `qualityBasis="static"`, When rendered, Then the card shows "12% escape", "800 – 2,400", "6,000 – 40,000", "9", the existing Range/Midpoint/Confidence rows still render, AND no "Refined with judge signal" badge appears.
- Given `qualityBasis="judge"`, When rendered, Then the "Refined with judge signal" `Badge variant="accent"` appears (mapped internally) and the regime values render normally.
- Given a legacy available prediction WITHOUT the new fields, When rendered, Then only the existing rows render and no regime block appears (backward compat).
- Given a disabled prediction (`missing_followers`), When rendered, Then the existing "Prediction unavailable" Alert + recovery render unchanged.
- Given the summary chip with `pEscape` present, Then the text appends "· 12% escape"; when absent, the chip text is byte-identical to today.

## Visual AC

Regime rows reuse the `.xb-deterministic-signals` row layout; escape `Badge variant="info"`;
"Refined with judge signal" `Badge variant="accent"` only when `qualityBasis === "judge"`;
no number-transition animation; **identical card height across `qualityBasis` values (no CLS)**;
`pEscape` percentage carries a text label (not color-only); regime sub-labels are `<dt>`/`<p>`,
not headings (no skipped levels under the card `h3`).

## Edge Cases

`pEscape` 0 or 1; `stallRange`/`escapeRange` with equal low/high; `qualityBasis` absent on a
legacy payload → treated as `"static"` (no badge).
