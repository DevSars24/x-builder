---
status: done
---

# AVS-005: [DOC] Document archive voice skill behavior

## Implementation Details

Update feature and local storage docs to reflect the derived archive voice profile, its local-only boundary, its evidence pointers, and its fail-open relationship to Voice RAG.

## Acceptance Criteria

- Feature README reflects shipped behavior and status.
- Local storage docs mention archive voice profile tables as derived local data.
- Docs state that generated drafts/replies are not voice evidence unless later captured/imported as authored posts.
