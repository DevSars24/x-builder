---
status: done
---

# AVS-001: [FND] SQLite archive voice profile artifact

## Implementation Details

Append a migration after the existing voice RAG projection. The migration stores only a derived local voice profile and evidence pointers back to canonical `post` rows.

The artifact is versioned by `rule_version` and `corpus_hash`. It must not mutate canonical post, metric, feedback, external-signal, or hand-authored settings tables.

## Acceptance Criteria

- Opening a fresh database migrates to the new schema version with archive voice profile tables.
- Evidence rows point at canonical `post.id` and cascade on deletion.
- No external X signal tables are read or treated as user voice evidence.
- Existing Voice RAG tables and canonical corpus tables remain unchanged.
