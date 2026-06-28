# External X Import + Signals - Build Order

Tickets build top to bottom. This epic adds a separate local external-signal ledger, observe-only runner ingestion for registered external sources, and a settings-panel workflow for managing sources and viewing evidence-backed patterns. It does not pollute the own-post corpus, add cloud sync, use X API credentials, navigate X automatically, or add model auto-tuning.

| ID | Status | Prefix | Title | Track | Depends on |
|---|---|---|---|---|---|
| EXS-001 | Todo | [FND] | Define ExternalXSignals shared contracts | shared | - |
| EXS-002 | Todo | [FND] | Append migration 3 and SqliteExternalXSignalsRepository | engine/storage | EXS-001 |
| EXS-003 | Todo | - | Build ExternalXSignalsService | engine/service | EXS-001, EXS-002 |
| EXS-004 | Todo | - | Add ExternalXSignals Fastify routes | engine/api | EXS-003 |
| EXS-005 | Todo | - | Extend EngineTransport and runner bindings | shared/runner/overlay transport | EXS-001, EXS-003 |
| EXS-006 | Todo | - | Add observe-only ExternalXSignalsCaptureObserver and runner wiring | runner/capture | EXS-003, EXS-005 |
| EXS-007 | Todo | - | Add ExternalXSignals settings section | overlay/settings | EXS-005 |
| EXS-008 | Todo | [INT] | Cover external X backend, transport, storage, and observer | engine/runner tests | EXS-001, EXS-002, EXS-003, EXS-004, EXS-005, EXS-006, EXS-007 |
| EXS-009 | Todo | [E2E] | Verify overlay ExternalXSignals workflow | e2e | EXS-008 |
| EXS-010 | Todo | [DOC] | Document External X Import + Signals | docs | EXS-009 |

## Pipeline Log

- 2026-06-28: RGB ticket audit approved after adding explicit persisted pattern snapshots and dual-observer no-leak coverage.
- 2026-06-28: Tickets authored from approved arch recon. Validator concern folded into EXS-006 and EXS-008.
