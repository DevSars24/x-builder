---
status: done
---

# AVS-003: Generation guidance consumes archive voice profile

## Implementation Details

Extend `createGenerationGuidanceResolver` with an optional archive voice profile provider. Render the derived profile before own voice samples so stable rules guide both post and reply generation, while existing Voice RAG samples remain available.

Reply generation is detected from `replyContext` and uses reply-specific rules. Normal post generation uses post-specific rules.

## Acceptance Criteria

- Guidance renders archive voice profile rules before sample examples.
- Reply requests receive reply-specific voice rules.
- Post requests receive post-specific voice rules.
- Provider failure or empty profile falls back to existing playbook, external pattern, and Voice RAG/sample behavior.
- Shared transport request/response schemas remain unchanged.
