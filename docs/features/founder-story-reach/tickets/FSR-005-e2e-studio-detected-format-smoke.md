---
status: done
---

# FSR-005: [E2E] Studio detected-format smoke

## User Flows to Verify

- Given a user opens Studio and enters a founder-story draft / When scoring
  completes / Then deterministic details can show `Detected format:
  Founder story`.
- Given the same Studio flow / When the prediction renders / Then no
  emotional/event controls, amplifier badges, amplifier signals, or
  tail-range amplification UI appears.
- Given the user runs Judge draft after scoring / When pass-2 refine completes /
  Then the judge panel behaves as before and does not introduce amplifier
  advice or fields.

## Architectural Invariants

- The UI displays `Founder story` through the existing detected-format surface.
- `EngagementPredictionCard` and `ReachRegimeBlock` remain amplifier-free.
- `AdvancedContextPanel`, `WriterPageModel`, `scoringContextFromAdvanced`,
  `runTwoPassRefine`, and `JudgePanel` do not gain amplifier state or request
  fields.

## Modules Under Test

Studio writer route, deterministic details surface, API client/request builder,
and judge refine flow with the existing mocked judge boundary.

## Pipeline Log

- 2026-06-15 — Done. Added a Studio Playwright smoke for a pasted founder-story
  draft: score, open deterministic details, see `Detected format: Founder story`,
  run Judge draft, assert the refine request carries only `{ impressions, replies }`,
  and verify no amplifier/emotional-growth UI copy appears.
