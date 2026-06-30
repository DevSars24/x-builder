---
status: done
---

# AVS-002: [FND] LLM-derived archive voice profile service

## Implementation Details

Create an engine-local service that samples the user's canonical local corpus, separates originals from replies, computes a stable corpus hash, and asks the configured structured LLM for compact voice rules.

The generated profile must include syntax habits, tone boundaries, recurring moves, anti-patterns, post rules, reply rules, and source evidence pointers. If the LLM or storage fails, generation must be able to continue without this profile.

## Acceptance Criteria

- Only local canonical `post` rows with `kind IN ('original', 'reply')` are eligible.
- Generated drafts/replies from feedback tables are not queried as evidence.
- Originals and replies are summarized separately.
- A current profile is reused when the corpus hash and rule version match.
- A failed LLM profile refresh returns no profile rather than blocking generation.
