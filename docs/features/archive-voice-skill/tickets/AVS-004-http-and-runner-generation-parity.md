---
status: done
---

# AVS-004: [INT] HTTP and runner generation parity

## Implementation Details

Wire the archive voice profile provider through the same explicit host-owned database seam used by Voice RAG. HTTP server construction and runner bound services must use the same generation guidance contract.

## Acceptance Criteria

- Default HTTP generation construction can render archive voice profile guidance.
- Runner bound generation construction can render archive voice profile guidance.
- No code recovers a database handle from `SqlitePostLibraryRepository` private internals.
- No new overlay transport method is added.
