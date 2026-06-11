---
status: todo
---

# CAD-015: [E2E] Provider Selection and Judge Flow End-to-End

## User Flows to Verify

All flows run against Playwright route-fixtured engine stubs — no real CLIs. Fixture ownership: one parameterized engine-stub builder in the e2e workspace taking `{ selectedProvider, slotState, slotLabel, judgeModel }` and producing the `/status`, `/settings`, and `/drafts/judge` stubs; it replaces the per-spec literal payloads across the three existing specs.

1. **Default-boot regression**: Given default settings with the codex slot ready / When the app boots / Then the status badge reads "Codex judge ready", a draft can be judged, and the verdict renders — the pre-epic flow is unchanged.
2. **Provider switch happy path**: Given boot with provider X selected and ready / When the user opens Settings, picks provider Y in "Judge provider", and saves (the stub returns a Y-labeled ready status) / Then the status badge reads "{Y label} ready" without a reload; And When the user navigates to Studio, **enters a draft** (drafts do not survive navigation — by design, asserted nowhere), and judges / Then the verdict renders attributed to Y via its catalog label and the response `model`.
3. **Switch to an unavailable provider — graceful degradation**: Given a switch to provider Y whose slot stubs `unavailable` with a message / When saved / Then the badge shows the danger state with the inline message and the "Open Settings" affordance; And the Studio judge button is disabled with the neutral hint while the deterministic generate/score flow still completes end-to-end.
4. **Settings-page copy guard**: Given the Settings page with the provider selector, the status bar, and the readiness badges all rendered / When the page is scanned for the banned-jargon regex (`codex exec`, `raw llm`, `llm judge`, `judge retry`, `retry judge` — case-insensitive) / Then zero matches.

## Architectural Invariants

Each falsifiable:

1. **Exactly four badges** render in the top status bar regardless of how many providers the catalog defines (assert by count, not labels).
2. **Judge gating derives from the selected slot only**: slot ready → judge enabled (no other readiness carrier exists in the payload that could disable it); slot unavailable → disabled regardless of which provider is selected; flipping the provider setting changes the gate only through the refreshed status publish, never through the settings value itself.
3. **Badge text derives from the server label**: a fixture with a novel `llm.label` string (one the client has never seen) renders verbatim in the badge — the client performs no provider-name mapping in the status path.

Explicitly excluded (verified false of the app, and not built in this epic): any assertion that the writer draft survives a settings round-trip — route navigation unmounts the writer page and resets its state. Draft persistence would be a product feature; it does not enter this epic through a test ticket.

## Modules Under Test

The full client shell against stubbed engine routes: status bar, settings route (provider select, save → publish chain), writer studio (judge gating, judge flow, verdict attribution), navigation guard. Specs touched: the judge-flow, shell-recovery smoke, and writer-deterministic specs (migrating to the parameterized stub builder).

## Pipeline Log

- 2026-06-11 — Created by arch-recon (multi-provider epic extension; validated APPROVE_WITH_CONCERNS, cycle 2).
