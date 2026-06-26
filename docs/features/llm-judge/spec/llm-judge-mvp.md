# LLM Judge — MVP Spec

> **As shipped (current — read this first).** This document is the original MVP spec
> (a single 0–10 rating on the now-removed Studio route). The judge has since grown
> well past it; the rest of this file is kept as historical record. What ships today:
>
> - **13-dimension verdict, each scored 0–100** (`judgeScoresSchema` in `shared/src/schemas/judge.ts`):
>   `overall`, `replies`, `profileClicks`, `impressions`, `bookmarkValue`, `dwellProxy`,
>   `voiceMatch`, `negativeRisk`, `answerEffort`, `strangerAnswerability`, `statusDependency`,
>   `replyVsQuoteOrientation`, `audienceMatch`. Plus a `label`
>   (`post_now` / `slight_rework` / `major_rework` / …), `confidence`, `headline`,
>   `strengths` (≤5), `improvements` (≤5).
> - **Inline span annotations** (`annotations`, ≤12): each is `{ quote, severity: suggestion|warning, recommendation }`,
>   rendered as composer underlines by `overlay/src/highlight/`.
> - **Three CLI providers**, not just Codex — selected via the `judgeProvider` setting
>   (`codex-cli` / `claude-cli` / `cursor-cli`); see [codex-adapter](../../codex-adapter/).
> - **Surface:** the overlay's `judge-strip.tsx` (on-demand Run judge), not a Studio panel.
>   Readiness gates on `status.llm.state` (the old `status.codex` slot was renamed).
> - **Authoring loop:** generate → judge → **apply all suggestions** (never-worse rewrite).
>   Documented in [generation-and-judge-surface](../../generation-and-judge-surface/).
>
> Request `POST /drafts/judge` also accepts an optional `accountProfile` for the
> audience-match dimension. The historical contract below predates all of this.

## Objective
Let a user ask Codex to critique a single pasted draft on demand, and show the
verdict (a 0–10 rating plus qualitative critique) in a standalone panel on the
Studio route. The judge is independent of the deterministic engine — it does not
feed the engagement prediction in this MVP.

## Scope decisions (locked)
- **Target:** the single draft pasted in the Studio textarea (not generated candidates).
- **Integration:** standalone Judge panel only; the deterministic prediction is untouched (the existing `aiRating` hook stays unused for now).
- **Trigger:** on-demand "Judge draft" button (no auto-run; the `runCodexJudgeAfterGeneration` setting stays inert this MVP).

## Out of scope
- Ranking/recommending generated candidates.
- Feeding the rating into the engagement prediction.
- Auto-run after generation; caching; streaming.

## Existing foundation (already built — the codex adapter)
`StructuredLlmService` + `CodexCliProvider` + `process-runner` + readiness probe
exist and are tested, but nothing instantiates or calls them yet. This feature is
the first real consumer of `generateStructured({ purpose: "candidate_judge" })`.

## API contract
### Request — `POST /drafts/judge`
```
{ "text": string (1..8000) }
```
### Success response (200)
```
{
  "status": "judged",
  "verdict": {
    "rating": int 0..10,
    "headline": string (1..160),       // one-line overall verdict
    "strengths": string[] (0..5, each 1..240),
    "improvements": string[] (0..5, each 1..240)
  },
  "model": string (1..120),            // provider/label, e.g. "codex"
  "judgedAt": ISO-8601 datetime
}
```
### Failure
Structured `apiError` (existing shape) with new code `judge_failed`.
- provider unavailable / unconfigured / timeout / process failure / invalid output → `judge_failed` (retryable per provider result).
- UI additionally gates the button on `status.codex.state === "ready"` so an unavailable judge is communicated before the call.

## Behavior / edge cases
- Empty/whitespace draft → button disabled (client) and `validation_failed` (server, via request schema).
- Codex not ready → button disabled with hint; if called anyway, `judge_failed` retryable.
- Codex slow (≤ ~60s adapter timeout) → button shows a loading state; request uses the adapter's default timeout.
- Provider returns malformed structured output → `structured_output_invalid` in adapter → mapped to `judge_failed`.
- No draft text is echoed in error details (adapter already strips stdout/stderr).

## Tickets (vertical slices)
- **LJ-001 (shared):** `judgeDraftRequestSchema`, `judgeVerdictSchema`, `judgeDraftResponseSchema`; add `judge_failed` to `apiError` code enum; tests.
- **LJ-002 (engine):** wire `StructuredLlmService` + `CodexCliProvider` at startup (injectable for tests); `JudgeDraftService` (builds prompt + `StructuredOutputContract` + maps results); `POST /drafts/judge`; failing tests first (fake provider for success + failure mapping; no-leak assertions).
- **LJ-003 (client):** `EngineApiClient.judgeDraft`; "Judge draft" button + `JudgePanel` on the writer route; button gated on codex readiness + non-empty draft; loading/error states; tests.
- **LJ-004 (validation):** integration happy-path + unavailable handling; e2e screenshot of the verdict panel.

## Acceptance criteria
- `POST /drafts/judge` with a valid draft and a (faked) ready provider returns a schema-valid `judged` verdict with rating 0–10.
- A provider failure yields a `judge_failed` apiError with no draft/stderr leakage; HTTP 5xx.
- An empty draft yields `validation_failed` (400).
- Client renders the verdict panel (rating, headline, strengths, improvements) and disables the button when codex is not ready or the draft is empty.
