---
status: todo
---

# RMU-019: [E2E] Reach-model scale separation + classifier corpus + studio flow

## User Flows to Verify

- Given the Studio / When the user pastes a draft, sets followers, expands Advanced context and sets a planned hour, waits for auto-score, clicks "Judge draft", and refine completes / Then they see: a four-regime prediction, 13 judge rows, and a "Refined with judge signal" prediction — all from one component tree.
- Given an empty account profile / When the user judges / Then `audienceMatch` shows "Needs account profile" with a working "Add account profile" path to Settings; after saving a profile and re-judging, it shows a number.
- Given each spec example string / When analyzed end-to-end through `/posts/analyze` / Then `detectedFormat` is the named member; "drop your startup link" → `cta_farm`; "Codex or Claude Code?" → `binary_choice`.

## Architectural Invariants

*Each must be falsifiable — a facade (file renames, copy-paste, router to separate implementations) must fail.*

- **Pre/post-judge scale separation:** pass-1 and pass-2 `predictedMidImpressions` are produced by different quality bases (`qualityBasis` differs), and the test asserts the two are **never numerically diffed or compared as the same scale** — a test that treats them as equal-scale (renders or computes a delta) must fail.
- The prediction card does not unmount/remount when `qualityBasis` switches `static → judge` — single component tree (a router-to-separate-implementations facade fails).
- The live classifier never emits `one_liner` or `goal_share` (a regression that re-emits them fails), while both remain valid `detectedPostFormatSchema` members (a payload carrying them still parses).
- A legacy `available` prediction (no regime fields, `qualityBasis` absent → treated as `static`) renders the original card with no regime block (backward-compat facade check).

## Modules Under Test

Engine `/posts/analyze` + `/drafts/judge` end-to-end (judge boundary mocked) through both
POSTs; `WriterPage` + `SettingsRoute` public drivers for the client flow. The corpus
accuracy targets are NOT exercised here (corpus absent — see RMU-016).
