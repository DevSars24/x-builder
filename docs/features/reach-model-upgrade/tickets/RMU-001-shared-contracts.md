---
status: in-progress
---

# RMU-001: [FND] Extend shared Zod contracts

## Implementation Details

Extend `@x-builder/shared` (re-export every new symbol from `shared/src/index.ts`) and
mirror the engine-side types. **Schema-only ticket** — no classifier, estimator, judge, or
UI behavior changes. All new tuning-relevant constants live in later tickets; this ticket
only widens the contracts.

1. **`detectedPostFormatSchema` + `PostFormat`** (in `deterministic-analysis.ts` and engine `types.ts`): add members `fill_blank_tribal`, `cta_farm`, `fantasy_question`, `binary_choice`, `nuanced_question`, `recognition_roast`, `wisdom_one_liner`, `milestone`. **Keep `one_liner`/`goal_share` here ONLY because the live classifier still emits them** — they are deleted in RMU-004 (their last emitter), NOT retained for any compat/“one release” window. The union backs `Record<PostFormat, …>` maps, so **every currently-exhaustive map must gain entries for the 8 new members to keep `typecheck` green at this point**: `predictionFormatLabels`, `varietyFormatLabels`, and `formatEngagementMultipliers` (the latter two maps are deleted wholesale in RMU-002/RMU-006). The client renders `detectedFormat` raw — no client label map to update.
2. **`scoringContextSchema`** (replaces the inline `{ followers }` in `analyzePostsRequestSchema`):
   - `followers: z.number().int().positive().optional()` (unchanged)
   - `trailingMedianImpressions: z.number().int().min(0).optional()`
   - `repeatHistory: z.array(repeatHistoryEntrySchema).max(40).default([])`
   - `plannedHourUtc: z.number().int().min(0).max(23).optional()`
   - `willAttachMedia: z.boolean().default(false)`
   - `accountAgeYears: z.number().int().min(0).max(50).optional()`
   - `judgeSignals: judgeSignalsSchema.optional()` (present only on the pass-2 re-issue)
   - `repeatHistoryEntrySchema = z.object({ format: detectedPostFormatSchema, lastPostedAt: z.string().datetime(), countLast7d: z.number().int().min(0).max(100) })`
   - `judgeSignalsSchema = z.object({ impressions: z.number().int().min(0).max(100), replies: z.number().int().min(0).max(100) })`
3. **`availableEngagementPredictionSchema`** — the **end-state** `available` variant carries the four-regime fields plus `signals` (kept — real explainability, with new multiplier contents). The final contract has **no** `rangeLow`/`rangeHigh`/`midpoint`/`confidence`.
   - New fields: `predictedMidImpressions: int ≥ 0`, `stallRange: reachRangeSchema`, `escapeRange: reachRangeSchema`, `escapeProbability: z.number().min(0).max(1)`, `expectedReplies: z.number().min(0)`, `baseImpressions: int ≥ 0`, `baseSource: z.enum(["trailing_median","follower_estimate"])`, `qualityBasis: z.enum(["static","judge"])`, `reachModelVersion: z.string().min(1).max(40)`.
   - `reachRangeSchema = z.object({ low: int ≥ 0, high: int ≥ 0 }).refine(r => r.low <= r.high)` — the only prediction invariant.
   - **Transitional only:** the current estimator + client still read `rangeLow`/`rangeHigh`/`midpoint`/`confidence`, so leave those fields (and their existing `.refine(rangeLow ≤ midpoint ≤ rangeHigh)`) on the variant **for now** — a temporary migration bridge **deleted in RMU-011** when the client migrates, NOT a permanent shim. RMU-019 asserts none survive. (If the pipeline forbids even a transitional field, fold the client field-read migration into RMU-006 so the old fields never coexist with the new — see the build note in the epic README.)
4. **`judgeScoresSchema`** — add (same `judgeScoreValue = z.number().int().min(0).max(100)` contract): `answerEffort`, `strangerAnswerability`, `statusDependency`, `replyVsQuoteOrientation`; and `audienceMatch: judgeScoreValue.nullable()` (nullable, NOT optional — always present on the wire, explicit `null` when no profile). Extend the judge JSON-output schema (`verdictOutputSchema`) and `judgeInstructions` in lockstep in RMU-008.
5. **`judgeDraftRequestSchema`** — add `accountProfile: z.string().trim().min(1).max(600).optional()`.
6. **`appSettingsSchema`** (`shell.ts`) — add `accountProfile: z.string().trim().max(600).optional()`.

## Data Models

All of the above. These are the authoritative cross-package contracts; every later ticket
consumes them by symbol name.

## Integration Point

Producer of all shared contracts. Consumed by `analyzePostsRequestSchema`,
`judgeDraftRequestSchema`, `appSettingsSchema`, the engine analyzer/estimator/judge, and
the client (RMU-010…014). No user-facing behavior on its own; the entry point is the
schemas other modules import.

## Scope Boundaries / Out of Scope

- IN: Zod schema + TS type widening, re-exports, exhaustive map type updates.
- OUT (zero-trace): classifier logic, multiplier tables, the bridge formula, judge prompt text, UI, calibration. No new `// CALIBRATE` constants here.
- Obsolete fields/members are removed within the epic (not retained for compat); any field that outlives its ticket is a temporary migration bridge with a named deletion ticket. No permanent shims.

## Test Strategy & Fixture Ownership

Unit. Owning suite: `shared/src/schemas/tests/*` (extend `deterministic-analyze.test.ts`,
`judge.test.ts`, `shell.test.ts`). Inline object fixtures. In-process; no external boundary.

## Definition of Done

`pnpm typecheck` and `pnpm test --filter @x-builder/shared` green. New fields parse; legacy
payloads (no new fields) still parse with defaults applied. All `Record<PostFormat, …>`
maps compile.

## Acceptance Criteria

- Given a legacy analyze request with only `{ followers }` in `scoringContext` / When parsed / Then it succeeds with `repeatHistory: []`, `willAttachMedia: false`, the rest undefined.
- Given an `available` prediction with `stallRange={low:10,high:240}` and `escapeRange={low:300,high:900}` / When parsed / Then it succeeds; a `reachRange` with `low > high` is rejected.
- Given judge scores with `audienceMatch: null` and the 4 new numeric dims / When parsed / Then it succeeds; `audienceMatch` omitted entirely → fails (nullable, not optional).
- Given `appSettings` JSON without `accountProfile` / When parsed / Then load succeeds, `accountProfile` undefined.
- Given `scoringContext.judgeSignals.impressions = 101` / Then rejected; given `repeatHistory` with 41 entries / Then rejected.

## Edge Cases

`trailingMedianImpressions = 0` is a present value (not absent). `judgeSignals` absent on
pass-1 is valid. `one_liner`/`goal_share` still parse at RMU-001 (the live classifier still emits them); RMU-004 removes them from the enum.
