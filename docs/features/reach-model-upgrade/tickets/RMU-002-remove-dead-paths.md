---
status: in-progress
---

# RMU-002: [RFR] Remove dead format-history, aiRating, and dormant relaxation paths

## Refactor Scope

- `format-history.ts` — delete (`appendPostFormatHistory`, `countRecentFormatStreak`, `buildFormatVarietyCheck`) and its tests.
- `types.ts` — remove `PostHistoryEntry`, `RecordPostHistoryEntryInput`, and the optional `varietyCheck` threading if it has no other live consumer.
- `varietyFormatLabels` — delete if unreferenced after the above (verify with `codebones graph` / `rg`).
- `aiRatingQualityMultipliers` table and the `fallbackAiRatingBand` in `const/scoring-weights.ts`.
- `aiRating` parameter throughout `AnalyzeOptions`, `analyzeDraftText`, `estimateEngagementRange`, `chooseQualityMultiplier`.
- The dormant `aiHighConfidenceSignalCount` / `aiMediumConfidenceSignalCount` relaxation in the confidence ladder.

Everything outside this list is untouchable. **Tension regex removal is NOT in this ticket**
— it changes prediction numerics and is therefore carved into RMU-007.

## Behavior-Preservation Invariants

- For any current request shape (`scoringContext` = `{ followers }` only, no `aiRating`, no `judgeSignals`), `/posts/analyze` output is identical before and after for `score`, `postCoach`, and `prediction`. These code paths are dead/unreachable in production (`analyzePosts` only ever passes `{ followers }`; `format-history` has zero non-test importers), so deletion is observably behavior-preserving.
- The engagement `confidence` value is unchanged for all inputs that never supplied `aiRating` (i.e. every production input today).

## Integration Point

No user-facing surface. Removes unreachable branches so RMU-005…008 build the greenfield
bridge cleanly rather than around the latent 0-10 path.

## Scope Boundaries / Out of Scope

Behavior-preserving deletions only. Zero-trace: no stubs, no commented-out code, no TODOs
left behind. No new logic; no tension-regex change; no schema change (`one_liner`/`goal_share`
are still emitted by the live classifier at this point — RMU-004 deletes them).

## Test Strategy & Fixture Ownership

Characterization pipeline: pinning tests are derived from the existing analyze-behavior
tests (do not author a new plan). Owning suite: engine deterministic tests. In-process.

## Definition of Done

`pnpm test` green with pinning tests passing before and after. `rg` for `format-history`,
`appendPostFormatHistory`, `aiRating`, `aiRatingQualityMultipliers` returns zero non-test
hits post-merge.

## Acceptance Criteria

- Given the current analyze test corpus / When analyze runs before and after this ticket / Then `score`, `postCoach`, and `prediction` are byte-identical.
- Given a post-merge `rg` for the deleted symbols / Then zero non-test hits.

## Edge Cases

If `varietyFormatLabels` or the `varietyCheck` param turns out to have a live consumer,
narrow the deletion and note it in the Pipeline Log rather than breaking that consumer.
