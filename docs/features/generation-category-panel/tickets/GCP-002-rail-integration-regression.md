---
status: in-progress
---

# GCP-002: [INT] Rail Integration Regression

## User Flows to Verify

- Given the compose cockpit is mounted with a fake transport returning a long category list, when the open-time category load settles, then the left rail renders every returned category label.
- Given a user clicks one category from that long list, when generation starts, then `generateIdeas` receives the clicked category's `format` and the pending state is keyed by that category's `id`.
- Given the fake category load rejects, when the cockpit settles, then the left rail renders no category buttons and the other cockpit zones remain mounted.
- Given the viewport is in the current browser-test mode, when the rail renders a long list, then the rail/cockpit combination introduces no additional horizontal document scroll.

## Architectural Invariants

- `ComposeCockpit` passes the array returned by `EngineTransport.getGenerateCategories` to `ComposeGenerateRail` without filtering, capping, sorting, or substituting categories.
- `ComposeGenerateRail` remains UI-only; it does not call transport methods directly.
- Category generation still uses the existing `GenerateCategory.format` request path.
- No engine, runner, shared transport, Fastify route, or category service code changes are needed for the bounded panel behavior.
- Wide mode must prove rail-local `70vh` scroll behavior; stacked mode may remain constrained by the existing outer cockpit pin.

## Modules Under Test

- `ComposeCockpit`
- `ComposeGenerateRail`
- `OverlayTransportProvider`
- `AnchorLayer`
- `FakeEngineTransport`
- Overlay compose cockpit test fixtures

## Integration Point

Parent mount: production-shaped overlay test tree using `OverlayTransportProvider`, `AnchorLayer`, and `ComposeCockpit` with a synthetic X composer fixture.

User entry point: compose context detection mounts the cockpit, open-time transport calls load categories, and the user clicks a category button.

Terminal outcome: the category rail displays the long returned list without changing the document's horizontal scroll footprint, and the clicked category still drives `generateIdeas({ format })`.

## Scope Boundaries / Out of Scope

In scope:

- Overlay browser integration coverage using the existing fake transport and synthetic composer harness.
- A synthetic long category list shaped like current `GenerateCategory`.
- Assertions that the rail remains bounded without relying on brittle pixel snapshots.

Out of scope:

- Top-level Playwright E2E harness repointing.
- Live X browser sessions.
- Engine, runner, Fastify, shared schema, or category-service tests.
- New transport methods or request/response fields.

## Test Strategy & Fixture Ownership

Coverage level: overlay integration/browser test.

Owning suite: existing `ComposeCockpit` browser integration tests.

Fixture strategy: reuse `FakeEngineTransport`, synthetic X composer fixtures, and category builders with explicit `recentCount` and `windowDays`. Long-list categories should be generated in the owning test area from existing detected formats or repeated valid category objects with unique ids/labels.

Dependency category: in-process fake transport and browser DOM only. No live X, no real engine, no runner, no filesystem, no persisted user state.

Isolation boundary: browser test DOM fixture; no port inference, no real page navigation, no top-level E2E web server.

## Acceptance Criteria

- Given a fake transport returns N categories, when `ComposeCockpit` settles, then N category buttons render in the left rail.
- Given the user clicks category K, when generation starts, then `generateIdeas` is called with category K's `format`.
- Given generation is pending for category K, when the rail renders, then category K is disabled/loading and other category buttons remain enabled.
- Given the fake transport rejects category loading, when the cockpit settles, then the rail has no category buttons and static/judge zones remain mounted.
- Given a long list of labels and badges, when the cockpit mounts, then the document horizontal scroll width does not grow beyond the synthetic composer fixture baseline.

## Visual AC

- Integration coverage must not assert brittle absolute pixel dimensions.
- It may assert computed style or inline style contracts for `max-height`, overflow, and scroll containment.
- It must explicitly allow the existing stacked outer pin to constrain effective height to `60vh`.

## Edge Cases

- Transport rejection.
- Long list.
- Long label.
- Cooldown/warming category in the long list.
- Current browser-test viewport producing either wide or stacked cockpit mode.

## Pipeline Log

- 2026-06-28: Ticket authored from approved arch recon; validator concern folded into stacked-mode wording.

- 2026-06-28: RGB `[INT]` pipeline started; pre-flight passed and ticket moved to in-progress.
