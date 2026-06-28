---
status: in-progress
---

# External X Import + Signals

Purpose: import external accounts and persist evidence-backed signal patterns.

## Architecture Context

External X Import + Signals adds a separate local evidence ledger for external X accounts. External source data must never enter the user's own post corpus, voice samples, cooldown windows, feedback actuals, archive-derived context, or `PostLibraryRepository.upsertPosts` path. The feature appends SQLite migration 3 and keeps migrations 1 and 2 untouched.

The canonical product entity is an `ExternalXSignalSource`. Users manage sources from the existing overlay settings panel. Refresh is observe-only: the runner may consume already-fetched X GraphQL responses emitted by the page, but it must not navigate, craft GraphQL requests, add X API credentials, auto-scroll, auto-follow, or synthesize network traffic.

`ExternalXSignalsService` owns source add/remove/refresh/overview behavior and persists evidence-backed pattern snapshots from the external ledger. `getExternalXSignalsOverview` returns source rows, totals, recent evidence, refresh runs, and persisted patterns in one bounded response. Future generation/scoring may consume patterns only through an explicit external-pattern provider; it must not read raw external posts as if they were the user's own writing.

Validator concern folded into the build: runner coverage must exercise the existing own-post `GraphQlCaptureObserver`/`LiveCaptureService` path and the new `ExternalXSignalsCaptureObserver` path together, proving registered external-source observations do not call or write the own-post repository.

## API Endpoints

- `GET /external-x/signals/overview` - returns bounded source, totals, recent evidence, refresh run, and pattern data.
- `POST /external-x/signals/sources` - adds or returns an existing external X signal source.
- `DELETE /external-x/signals/sources/:sourceId` - soft-removes a source from active overview and future refresh.
- `POST /external-x/signals/sources/:sourceId/refresh` - records a refresh attempt and reconciles already-observed evidence for that source.

The overlay reaches the same behavior through four `EngineTransport` methods:

- `getExternalXSignalsOverview(request?)`
- `addExternalXSignalSource(request)`
- `removeExternalXSignalSource(request)`
- `refreshExternalXSignalSource(request)`

The transport surface grows from exactly 20 methods to exactly 24 methods. No aliases or fifth method are allowed.

## Component Breakdown

- `external-x-signals` shared schemas - Zod contracts for sources, evidence, metric snapshots, refresh runs, patterns, totals, overview, add, remove, and refresh payloads.
- `SqliteExternalXSignalsRepository` - owns migration-3 external ledger writes and reads over the same SQLite handle as the engine store without touching own-post tables, including persisted pattern snapshots and evidence links.
- `ExternalXSignalsService` - adds/removes sources, ingests observed timeline batches, records refresh runs, computes overview totals, and persists deterministic patterns with evidence refs.
- `ExternalXSignalsCaptureObserver` - runner-side observe-only external timeline observer that gates ingestion by registered source and never makes active X requests.
- `ExposeFunctionTransport` external bindings - validates the four canonical transport methods against shared schemas.
- `ExternalXSignalsSettingsSection` - dense settings-panel UI for source management, refresh state, and external evidence-backed patterns.

## Dependencies

- Existing local SQLite foundation through `openEngineDatabase`.
- Existing settings-panel architecture: `SettingsAffordance` owns transport calls; `SettingsPanel` renders presentational sections.
- Existing shared transport binding registry and exact-count tests.
- Existing runner observe-only capture boundary from `GraphQlCaptureObserver`.
- Existing v2 overlay primitives and tokens.

## Sub-Tickets Overview

1. `EXS-001: [FND] Define ExternalXSignals shared contracts`
2. `EXS-002: [FND] Append migration 3 and SqliteExternalXSignalsRepository`
3. `EXS-003: Build ExternalXSignalsService`
4. `EXS-004: Add ExternalXSignals Fastify routes`
5. `EXS-005: Extend EngineTransport and runner bindings`
6. `EXS-006: Add observe-only ExternalXSignalsCaptureObserver and runner wiring`
7. `EXS-007: Add ExternalXSignals settings section`
8. `EXS-008: [INT] Cover external X backend, transport, storage, and observer`
9. `EXS-009: [E2E] Verify overlay ExternalXSignals workflow`
10. `EXS-010: [DOC] Document External X Import + Signals`

## Pipeline Log

- 2026-06-28: RGB ticket audit approved after adding explicit persisted pattern snapshots and dual-observer no-leak coverage.
- 2026-06-28: Arch recon approved with concern. Concern folded into EXS-006 and EXS-008: tests must prove external observations cannot leak through the existing own-post live-capture path.
