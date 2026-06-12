---
status: todo
---

# RMU-017: [INT] Engine two-pass analyze + judge bridge integration

## User Flows to Verify

- Given followers + a draft / When `POST /posts/analyze` without `judgeSignals` / Then 200 with `qualityBasis="static"`, all four-regime fields present, and the legacy `{rangeLow, rangeHigh, midpoint, confidence, signals}` present and ordered.
- Given a judged draft / When `POST /posts/analyze` with `scoringContext.judgeSignals = { impressions, replies }` / Then 200 with `qualityBasis="judge"` and a reach that differs from pass-1.
- Given `accountProfile` in persisted settings / When `POST /drafts/judge` WITHOUT it in the body / Then the judge receives the settings value and `audienceMatch` is non-null.
- Given only `trailingMedianImpressions` (no `followers`) / When `POST /posts/analyze` / Then 200 `available` with `baseSource="trailing_median"` (NOT `disabled/missing_followers`).

## Architectural Invariants

- The legacy `{rangeLow, rangeHigh, midpoint, confidence, signals}` keys are ALWAYS present on an `available` prediction (a facade that dropped them fails).
- `rangeLow === stallRange.low` and `rangeHigh === escapeRange.high` (a reshuffle that decouples the derived legacy fields from the regimes fails).
- `score` and `postCoach` are byte-identical between pass-1 and pass-2 for the same draft — the quality gate/verdict is untouched by the judge bridge (a facade that lets the judge leak into the score fails).
- The deleted `aiRating`/`format-history` paths are not reachable (a facade that re-introduces the 0-10 path fails).

## Modules Under Test

`/posts/analyze` route → `DeterministicAnalysisService.analyzePosts` → `computeReachModel`;
`/drafts/judge` route → `JudgeDraftService.judge` (in-process `JudgeLlmGateway` fake — no real
CLI); settings → judge `accountProfile` fallback. Fastify `inject`; in-process; the judge LLM
is a true-external boundary stubbed by the in-process fake.
