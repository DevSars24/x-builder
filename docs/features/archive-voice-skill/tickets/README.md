# Archive Voice Skill - Build Order

Tickets build top to bottom. This epic adds a local, derived voice profile over the user's own canonical corpus and makes generation consume it without replacing Voice RAG fallback.

| ID | Prefix | Title | Track | Depends on |
|---|---|---|---|---|
| AVS-001 | [FND] | SQLite archive voice profile artifact | engine/storage | - |
| AVS-002 | [FND] | LLM-derived archive voice profile service | engine/voice | AVS-001 |
| AVS-003 | - | Generation guidance consumes archive voice profile | engine/llm | AVS-002 |
| AVS-004 | [INT] | HTTP and runner generation parity | engine/runner | AVS-003 |
| AVS-005 | [DOC] | Document archive voice skill behavior | docs | AVS-004 |
