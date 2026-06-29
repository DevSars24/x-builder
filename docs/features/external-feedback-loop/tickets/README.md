# External Feedback Loop - Build Order

Tickets build top to bottom. This epic consumes persisted External X Signals patterns as sanitized generation constraints. It does not add external evidence to the user's own corpus, voice samples, feedback actuals, active context, local post history, judge/apply prompts, transport methods, or overlay UI.

| ID | Status | Prefix | Title | Track | Depends on |
|---|---|---|---|---|---|
| EFL-001 | Todo | [FND] | Define external pattern guidance contracts and renderer | engine/llm | - |
| EFL-002 | Todo | [FND] | Add pattern-only snapshot reader | engine/external storage | EFL-001 |
| EFL-003 | Todo | - | Wire external pattern guidance into generation | engine/llm, runner/server construction | EFL-001, EFL-002 |
| EFL-004 | Todo | - | Enforce no-contamination boundaries | engine policy tests | EFL-003 |
| EFL-005 | Todo | [INT] | Cover external pattern generation integration | engine/runner tests | EFL-001, EFL-002, EFL-003, EFL-004 |
| EFL-006 | Todo | [DOC] | Document External Feedback Loop | docs | EFL-005 |

## Pipeline Log

- 2026-06-29: Tickets authored from approved arch recon. Validator fix folded into EFL-003 and EFL-005: provider/reader construction must share the same external repository as `ExternalXSignalsService`; injected service without paired provider disables external generation guidance rather than creating a separate reader.
- 2026-06-29: RGB ticket audit approved after updating EFL-002, EFL-004, and EFL-005 to match current repository/schema behavior.
