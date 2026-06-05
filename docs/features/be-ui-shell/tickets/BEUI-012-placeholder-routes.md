# BEUI-012: [FE] Voice And Post Library Placeholder Routes

## Goal

Implement shell-owned Voice and Post Library placeholder routes without implying their full feature workflows exist.

## In Scope

- `/voice` placeholder route.
- `/library` placeholder route.
- Active nav state.
- Honest placeholder copy.
- Back to Writer action.
- Optional Open Settings action for storage readiness context.
- No backend data query from either placeholder.

## Out Of Scope

- Voice extraction.
- Voice profile editing.
- Post import.
- Known posts table.
- Storage-backed library rows.

## Acceptance Criteria

- Given `/voice` is opened, then Voice placeholder renders and Voice nav is active.
- Given `/library` is opened, then Post Library placeholder renders and Library nav is active.
- Given backend is unavailable, then placeholders still render.
- Given placeholder primary action is clicked, then it navigates to Writer or the configured target.
- Given screen reader reads placeholder content, then it is not announced as an error or empty data query.

## Test Strategy

- Suite: client Vitest route integration tests.
- Fixture strategy: route harness with status ready and unavailable states.
- Dependency category: in-process only.

## Dependencies

- BEUI-006.
- BEUI-008.
- BEUI-007.
