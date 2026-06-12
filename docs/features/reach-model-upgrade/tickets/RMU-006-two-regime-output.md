---
status: todo
---

# RMU-006: Two-regime reach output + expectedReplies + base override + disabled-guard fix

## Implementation Details

Replace the body of `estimateEngagementRange` with `computeReachModel`, assembling the
four-regime output from the RMU-005 tables/helpers. Spreads computed in **log space**.

1. **Base + disabled-guard precedence.** Respecify `toEngagementPrediction`'s disabled logic
   (the live followers-first short-circuit is a bug under the new spec):
   - (a) `followers` absent **AND** `trailingMedianImpressions` absent → `{ status:"disabled", reason:"missing_followers" }`.
   - (b) else if the analyzer prediction is `null` (text < `minimumTextLength`) → `{ status:"disabled", reason:"text_too_short" }` (precedence unchanged from today).
   - (c) else → `available`. `base = trailingMedianImpressions ?? clamp(0.4·followers, existing follower bounds)`; `baseSource = trailingMedianImpressions !== undefined ? "trailing_median" : "follower_estimate"`. Floor `base` to ≥1 before any log-space computation.
   `computeReachModel`'s own null-guard uses the SAME "followers undefined AND median undefined" condition so the two guards agree (no split-brain).
2. **Midpoint.** `mid = base · formatMult · qualityMult · linkMult · repeatMult · statusMult` where `formatMult = formatReachTable[format].p50Multiplier`, `qualityMult = staticQualityCompression(score)` (static path only here — judge branch is RMU-008), `linkMult = hasExternalLink ? externalLinkMidpointMultiplier(0.2) : 1`, `repeatMult = computeRepeatMultiplier(...)`, `statusMult = computeStatusMultiplier(...)`.
3. **pEscape.** `escapeProbability = formatReachTable[format].escapeProbability`, adjusted: ×0.5 if format ∈ {`nuanced_question`, `wisdom_one_liner`, `insight_share`}; **capped at `externalLinkEscapeCap` (0.03) when `hasExternalLink`**. Answer-effort and trending adjustments are added in RMU-007 (neutral here).
4. **Ranges (log space).** `stallRange = [round(0.3·base), round(1.2·mid)]`, `escapeRange = [round(3·base), round(12·base)]`.
5. **expectedReplies.** `mid · replyRateTable[format]` (static path; judge `replies` override is RMU-008; tribe +20% is RMU-007).
6. **Legacy mirror.** `rangeLow = stallRange.low`, `rangeHigh = escapeRange.high`, `midpoint = predictedMidImpressions = round(mid)`. Set `qualityBasis = "static"`, `baseSource`, `baseImpressions = base`, `reachModelVersion`.
7. **Confidence ladder.** Keep the relaxation but rename internally to reflect input richness (e.g. `inputRichnessConfidence`) with a comment that it reflects input richness, not accuracy.
8. **Service wiring.** `DeterministicAnalysisService.analyzePosts` reads the full `scoringContext` and computes `hasExternalLink = detectExternalLink(item.text)` per item, passing `{ followers, trailingMedianImpressions, repeatHistory, hasExternalLink }` into `analyzeDraftText`.

## Data Models

Produces the `available` prediction four-regime fields from RMU-001. Consumes RMU-005
tables/helpers.

## Integration Point

`POST /posts/analyze` pass-1 (`qualityBasis="static"`). User entry: auto-score in the
writer studio (debounced). Terminal outcome: four-regime prediction rendered (RMU-011).

## Scope Boundaries / Out of Scope

Static-quality path only. Zero-trace: no `judgeSignals` branch (RMU-008), no answer-effort
/ trending / tribe adjustments (RMU-007 — keep them neutral here). Quality score, check
pools, `min()` aggregation, and verdict bands are UNCHANGED.

## Test Strategy & Fixture Ownership

Unit + extend the `/posts/analyze` response-shape test. `buildReachInput()` builder
(shared with RMU-005). In-process.

## Definition of Done

Four-regime fields present and ordered; disabled-guard precedence correct; log-space
spreads; `pnpm test` + `pnpm typecheck` green.

## Acceptance Criteria

- Given `followers=5000`, no median, format `cta_farm` / When analyzed / Then `baseSource="follower_estimate"`, `escapeRange.high = 12·base`, `rangeHigh === escapeRange.high`, `midpoint === predictedMidImpressions`, `qualityBasis="static"`.
- Given `trailingMedianImpressions=2000` present and `followers` ABSENT / When analyzed / Then the prediction is `available` with `baseSource="trailing_median"` and base derived from 2000 (NOT `disabled/missing_followers`).
- Given `trailingMedianImpressions=2000` AND followers present / Then `baseSource="trailing_median"` (median wins).
- Given BOTH `followers` and `trailingMedianImpressions` absent / Then `disabled` with `reason="missing_followers"`.
- Given a base present but text < 15 chars / Then `disabled` with `reason="text_too_short"` (precedence preserved).
- Given an external-link draft / Then `midpoint` is ×0.2 **and** `escapeProbability ≤ 0.03` (the cap moves pEscape; the ×0.2 moves midpoint — separate effects).
- Given format `nuanced_question` / Then `escapeProbability` is half the table value.
- Given any `available` prediction / Then `rangeLow ≤ midpoint ≤ rangeHigh`.

## Edge Cases

`trailingMedianImpressions=0` is a present value → `available`/`trailing_median`, base
floored to ≥1 (also closes the `log(0)` risk). Both base inputs absent → `missing_followers`.
`statusMult` only applies to `wisdom_one_liner`.
