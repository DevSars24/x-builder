---
status: implemented
---

# Deterministic Engine

Purpose: score the live draft without depending on LLM availability — instant, rule-based, and calibrated to your account. This is the always-on layer behind the static-engine column in the overlay; the LLM judge is the separate on-demand layer.

## Stored Logic

- **Entry point:** `DeterministicAnalysisService` in `engine/src/deterministic/deterministic-analysis-service.ts` — orchestrates the analysis and is wired into the `/posts/analyze` route.
- **Draft analysis:** `analyzeDraftText` in `engine/src/deterministic/analyzer.ts` (format detection, voice/writing/quality-signal checks, text metrics).
- **Reach model:** `computeReachModel` in `engine/src/deterministic/prediction-estimator.ts` (+ `const/reach-model-weights.ts`) — stall range, escape range, escape probability, calibrated to follower count + trailing-median performance. Includes the repeat/status/judged-quality multipliers (`computeRepeatMultiplier`, `computeStatusMultiplier`, `toJudgedQualityMultiplier`).
- **Post Coach:** `deriveApiPostCoach` in `engine/src/deterministic/post-coach-view-model.ts` — Fix (red) / Nudge (yellow) checks (hook, tension, quotability, hedging, em-dashes, weak closers…).

## Surfacing

- **Endpoint:** `POST /posts/analyze` runs the full deterministic pass and (in the runner) re-attaches per-item cooldown signals from the repetition window.
- **Transport:** in the overlay, this is reached in-process via `analyzePosts` on the transport seam, not over HTTP.
- **UI:** `overlay/src/compose/static-engine-column.tsx` renders the reach prediction + Post Coach card; updates as you type (debounced).

## Related direction — smarter generation context

The reach playbook the generator grounds drafts in is currently sent to the LLM in full on every generate call. The active direction is to send only the format-relevant slice plus a tight voice sample. Tracked in [generation-and-judge-surface](../generation-and-judge-surface/) — it doesn't change the deterministic pass, which stays LLM-free.
