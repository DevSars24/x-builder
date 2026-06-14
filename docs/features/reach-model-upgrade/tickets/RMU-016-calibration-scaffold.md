---
status: in-progress
---

# RMU-016: Calibration scaffold — normalizer, predictor-runner, per-format fit, leave-one-account-out validator

## Implementation Details

Build the calibration harness in `@x-builder/calibration` (RMU-015). The labeled corpus
JSONL is **not yet in the repo**, so every function is pure (`input → output`) and tested
against synthetic in-repo fixtures; **no accuracy targets are asserted** (see Scope).

**The fit is per-format aggregation, not regression.** At ~350 rows over many features OLS
is the wrong tool; the hand-set tables are placeholders that aggregation refits directly.

1. **`CalibrationRow` Zod schema** — the input contract: `{ account, postId, time, text, impressions, likes, reposts, replies, bookmarks, followers, followers_at_post, trailing_median_imps (nullable), detected_format, repeat_count, days_since_same_format, has_external_link (nullable), hour_utc, weekday, escape_label (nullable) }`.
2. **`normalizeExportToRows(export, opts) → CalibrationRow[]`** — one row per ORIGINAL post:
   - `followers_at_post`: interpolate from milestone posts matching `/[\d.,k]+\s*followers?\s*(in|on day)\s*\d+/` when the account has them, else snapshot.
   - `trailing_median_imps`: median of the prior 14 days of originals; `null` for the first 14 days.
   - `repeat_count` / `days_since_same_format`: within-account, by `detected_format` (via `classifyPostFormat`).
   - `hour_utc`, `weekday` from `time`.
   - `escape_label`: `actual_impressions > 3 × trailing_median_imps`; `null` when the median is null.
   - **Exclusions:** retweets, 0-impression posts, pinned posts (a hard-coded pinned-ID list per account, passed via `opts`).
   - **t.co rule (distinct from the live analyzer):** X rewrites every link AND every media attachment as a `t.co` URL in the post text. So: a `t.co` URL whose entity matches `entities.media` → **media, not external**; if the export lacks `entities` for a `t.co`-only post → set `has_external_link = null` and **exclude that row from the link-penalty fit** (do not default it to external — that would wrongly penalize image posts, e.g. milestone charts). Non-`t.co` external URLs → `has_external_link = true`.
3. **`runPredictor(rows, { engine, judge? }) → PredictedRow[]`** — run the real deterministic engine over each row; optionally the judge; store both prediction variants per row.
4. **`fitReachConstants(rows) → ReachConstantsFile`** — per-format aggregation:
   - format multiplier = **geometric median** of `impressions / trailing_median_imps` per `detected_format` (rows with null median excluded).
   - `escapeProbability` = empirical **fraction of `escape_label === true`** per format (null-label rows excluded).
   - reply rate = **median** of `replies / impressions` per format.
   - repeat decay = aggregate `impressions` ratio by `repeat_count` bucket; status curve = aggregate by follower bucket for `wisdom_one_liner`.
   - **link-penalty fit excludes rows where `has_external_link` is null** (the t.co-ambiguous rows).
   - Emit a generated constants file with a header comment carrying the fit date and corpus size.
5. **`validateLeaveOneAccountOut(rows) → { rhoPerAccount, meanRho, escapeAuc }`** — fit on all-but-one account, score the held-out account, compute **Spearman** rank correlation per held-out account (hand-rolled: rank-transform + Pearson) and **AUC** for pEscape vs `escape_label` (hand-rolled: Mann-Whitney). Report only; do not gate on a threshold.

## Data Models

`CalibrationRow`, `ReachConstantsFile`. Consumes `classifyPostFormat` and the real engine
(RMU-004…008).

## Integration Point

CLI: `pnpm --filter @x-builder/calibration <script>` (developer task — normalize, predict,
fit, validate). The "user" is the developer running the calibration; terminal outcome = a
generated constants file + a validation report printed to stdout. Runs the real engine via
`runPredictor`.

## Scope Boundaries / Out of Scope

Scaffold + mechanics only. **Accuracy targets (rho ≥ 0.5, escape AUC) are explicitly OUT of
scope** — the corpus is absent; tests assert mechanics, not accuracy. The generated constants
file is NOT auto-wired into the engine (zero-trace: no import of generated constants by the
live engine). No OLS / regression / stats library.

## Test Strategy & Fixture Ownership

Unit; pure functions. Owning suite: `tools/calibration` tests. Fixture: a test-owned
synthetic JSONL (2 accounts, ~30 rows) under the package's fixtures. **The synthetic
distribution must be bimodal — a stall cluster plus a separate escape cluster per format —
not Gaussian around a midpoint**, so the mechanics tests exercise the shape the real corpus
actually produces (and don't pass on a shape the corpus never makes). Corpus JSONL = true
external / absent → synthetic fixtures only. In-process, pure.

## Definition of Done

All four functions implemented and unit-tested on the bimodal synthetic fixture; generated
constants file has the dated/sized header; no stats dependency; `pnpm test` + `pnpm typecheck` green.

## Acceptance Criteria

- Given a synthetic export with a milestone post "1.2k followers in 90 days" / When normalized / Then `followers_at_post` interpolates; first-14-day rows have `trailing_median_imps = null` and `escape_label = null`.
- Given a `t.co` URL matching `entities.media` / When normalized / Then `has_external_link = false` (media). Given a `t.co`-only post with no entities / Then `has_external_link = null` and the row is excluded from the link-penalty fit.
- Given retweets / 0-impression / pinned-ID rows / Then they are excluded.
- Given a bimodal fixture with a planted per-format ratio / When `fitReachConstants` / Then the refit format multiplier equals the geometric median of the planted ratios (mechanics, exact), and `escapeProbability` equals the planted escape fraction.
- Given a known-rank fixture / When `validateLeaveOneAccountOut` / Then Spearman rho equals the hand-computed value and escape AUC equals the hand-computed value (mechanics, not a 0.5 target).
- Given the generated constants file / Then its header includes the fit date and corpus size.

## Edge Cases

Account with < 14 days of posts → all `escape_label = null` → excluded from the escape-fit.
Empty corpus → empty rows, no throw. A format with zero rows → fit leaves its placeholder
unchanged and logs that it was not refit (no silent zero).
