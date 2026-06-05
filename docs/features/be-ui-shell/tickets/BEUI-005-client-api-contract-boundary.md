# BEUI-005: [FE] Client API Contract Boundary

## Goal

Add a typed client API boundary that parses every engine response with shared schemas and classifies client-side failures.

## In Scope

- `EngineApiClient`.
- `getStatus`.
- `getSettings`.
- `saveSettings`.
- `generateIdea`.
- Timeout classification.
- Network failure classification.
- HTTP error body parsing through `apiErrorSchema`.
- Invalid JSON and invalid response schema classification as `invalid_response`.

## Out Of Scope

- UI rendering.
- Retry UI.
- Server endpoint implementation.

## Acceptance Criteria

- Given `GET /status` returns valid status, then the client returns typed `AppStatus`.
- Given fetch rejects, then the client returns or throws `engine_unreachable`.
- Given request times out, then the client returns or throws `request_timeout`.
- Given a response body does not match its schema, then the client returns or throws `invalid_response`.
- Given an HTTP error includes `apiErrorSchema`, then the client preserves `code`, `scope`, `retryable`, and `fieldErrors`.

## Test Strategy

- Suite: client Vitest.
- Fixture strategy: mocked `fetch`, small inline response bodies.
- Dependency category: local mocks; no live engine.

## Dependencies

- BEUI-001.
- BEUI-002 for server error shape.
- BEUI-003 and BEUI-004 for endpoint producers.
