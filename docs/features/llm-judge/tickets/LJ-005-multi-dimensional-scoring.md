# LJ-005: [FEAT] Multi-Dimensional Judge Scoring

## Goal

Replace the judge's single 0-10 rating with a multi-dimensional scoring model
(per the x-post-performance skill): eight 0-100 dimension scores, a derived
verdict band, and a confidence level, while keeping the existing qualitative
critique. This makes the verdict show *why* a post scores the way it does.

## Context

- The MVP verdict is `{ rating 0-10, headline, strengths, improvements }`.
- The x-post-performance skill defines a richer, recognized model the user wants:
  separate 0-100 scores for replies, profile clicks, impressions, bookmark value,
  dwell proxy, voice match, negative risk, and an overall; a verdict band; and a
  confidence level.
- This is a coordinated, breaking contract change across shared + engine + client,
  so it ships as one ticket / one commit (not independently shippable slices).

## In Scope

- Shared: new `judgeScoresSchema` (8 dims), `judgeVerdictLabel`/`judgeConfidence`
  enums; reshape `judgeVerdictSchema` to `{ verdict, confidence, scores, headline,
  strengths, improvements }` (drop `rating`); export new types; update tests.
- Engine: the codex output schema produces the LLM part (8 scores + confidence +
  critique, NOT verdict); enrich `judgeInstructions` with a concise per-dimension
  rubric + confidence guidance; `JudgeDraftService` derives `verdict` from
  `scores.overall` and assembles the final verdict; update tests.
- Client: `JudgePanel` renders the 8 dimension scores, the verdict badge, and
  confidence (instead of "N/10"), keeping headline/strengths/improvements; update
  `JudgeState`/tests.
- E2E: update `judge-flow.spec.ts` stub + assertions to the new shape.

## Out Of Scope

- Rewrites (best/more-direct/discussion-focused) — separate enhancement.
- Any personal voice profile. This project is shared/multi-tenant: no individual's
  voice DNA is embedded. `voiceMatch` is scored generically — "reads as an
  authentic human voice, not generic AI-slop" — using only the generic X-post
  rubric. A per-user voice profile (brought by each user) is a future feature that
  would personalize this dimension; it is NOT part of this ticket. The judge prompt
  must contain no user-specific examples, names, or personal-voice rules.
- Feeding `overall` into the deterministic engagement prediction (`aiRating` hook).
- main_issue / why_it_might_work / why_it_might_fail critique fields.

## Requirements

- `scores`: object of eight integers 0-100: `overall, replies, profileClicks,
  impressions, bookmarkValue, dwellProxy, voiceMatch, negativeRisk`.
- `verdict`: enum `post_now | slight_rework | major_rework | do_not_post`, derived
  in the engine from `scores.overall` (NOT produced by the LLM), bands:
  `>=85 post_now`, `70-84 slight_rework`, `40-69 major_rework`, `<40 do_not_post`.
- `confidence`: enum `low | medium | high` (LLM-produced).
- `headline` (1..160), `strengths`/`improvements` (each item 1..240, max 5) retained.
- `rating` removed from the contract.
- The codex output schema (LLM-facing) must match the parser; verdict is excluded
  from the LLM output (it is derived). Keep the JSON schema lenient on extra keys.
- Failure mapping, no-leak, timeout, gating, and unmount discipline from LJ-002/003
  are preserved unchanged.

## Acceptance Criteria

- A valid multi-dimensional verdict parses; a score outside 0-100, a non-integer
  score, a bad verdict/confidence enum, or a missing dimension fails validation.
- `JudgeDraftService` maps a successful LLM result (8 scores + confidence +
  critique) to a verdict where `verdict` is derived from `overall` per the bands
  (test each band boundary: 90→post_now, 78→slight_rework, 55→major_rework,
  30→do_not_post).
- `POST /drafts/judge` returns the schema-valid multi-dimensional verdict; failures
  still map to `judge_failed`; empty draft still `validation_failed`.
- `JudgePanel` renders the verdict badge, confidence, all eight dimension scores,
  headline, strengths, improvements; still gated on codex readiness + non-empty
  draft; loading/error states unchanged.
- E2E: codex-ready → judge → panel shows the verdict band + dimension scores;
  codex-unavailable → button disabled with hint.

## Test Strategy

- Shared Vitest: schema accept/reject (bounds, enums, missing dims).
- Engine Vitest: `JudgeDraftService` verdict-derivation per band with an injected
  fake gateway; route tests for the new shape + preserved failure/validation paths.
- Client Vitest (SSR): `JudgePanel` renders the new fields; workflow `runJudgeDraft`
  maps the new verdict; gating/unmount preserved.
- E2E Playwright: updated judge-flow happy path + disabled state.

## Dependencies

- LJ-001..004 (the judge feature this extends).

## Status

DONE via the full dem-pipeline: tests-first (RED) -> implement (shared schema,
engine output-schema + generic rubric prompt + server-side verdict derivation,
client multi-dim panel, e2e) -> independent review gates (code/intent/test) ->
final validator. Intent + code PASS; applied review fixes: defensive spread so the
derived verdict always wins + a test proving a model-supplied verdict is ignored;
restored the response-envelope + empty-arrays schema tests; panel test now asserts
all 8 dimensions; engine parser test covers all four bands. Confirmed (grep + code
review) no personal voice DNA is embedded — voiceMatch is generic and the project
stays shareable. 383 unit tests + 2 e2e green; typecheck clean. Verdict panel
screenshot: /tmp/lj-judge-verdict.png.
