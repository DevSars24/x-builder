---
status: implemented
---

# Archive Voice Skill

Purpose: build an explicit local writing voice skill from the user's uploaded archive corpus so post and reply generation share one stable voice source instead of relying only on nearest-neighbor examples.

## Current Implementation

- `my-x-archive-import` imports `tweets.js` into the canonical local corpus.
- `voice-rag-generation` retrieves original-post voice samples from the SQLite corpus.
- `generation-guidance` can include requested format playbook slices, external pattern guidance, and own voice samples.
- `archive-voice-skill` derives a versioned local voice profile from canonical originals and replies, then renders post- or reply-specific rules into generation guidance before Voice RAG samples.

## Target Shape

The archive voice skill is a derived local artifact over the user's own corpus. It should summarize durable writing rules, syntax habits, tone boundaries, recurring moves, anti-patterns, and post-vs-reply differences. It should be refreshed from the local archive/corpus through a cheap fast LLM batch pass, then consumed by both post and reply generation.

The artifact should be versioned and explainable. It should preserve source evidence pointers to examples, but generated content must not become voice evidence unless it later appears as a real authored post/reply from capture or archive import.

## Boundaries

- Local-first; no hosted profile sync.
- Do not overwrite any hand-authored voice rules without versioning and a reviewable diff.
- Do not train on external accounts as the user's voice.
- Do not include generated drafts or generated replies as voice evidence.
- The first version can use configured cheap LLM labeling/summarization; it should fail open to existing Voice RAG samples.

## Existing References

- `docs/features/my-x-archive-import/README.md`
- `docs/features/voice-rag-generation/README.md`
- `docs/features/smarter-generation-context/README.md`
- `engine/src/llm/generation-guidance.ts`
- `engine/src/voice/sqlite-voice-sample-provider.ts`
- Reference repo idea: `../XActions/docs/features/x-voice-generation/README.md`

## Shipped Shape

- Migration 5 adds `archive_voice_profile` and `archive_voice_profile_evidence` as local derived tables beside the canonical corpus and Voice RAG projection.
- `ArchiveVoiceProfileService` samples canonical local originals and replies, computes a corpus hash, and asks the configured structured LLM for compact rules.
- `createGenerationGuidanceResolver` renders archive voice profile rules before own voice samples, using post-specific rules for normal generation and reply-specific rules when `replyContext` is present.
- Existing Voice RAG and newest-original fallback remain in place. If the profile provider, LLM, or storage fails, generation continues without the archive profile section.
- Generated drafts/replies are not queried as evidence; only canonical own corpus rows are eligible.

## Pipeline Log

- 2026-06-30: Implemented local archive voice profile storage, LLM derivation service, generation guidance rendering, HTTP/runner wiring, and local storage docs.

## Bookkeeper Prompt

```txt
Goal:
Build an archive-derived x-builder voice skill/profile from the user's own uploaded archive corpus, then make it available to both post and reply generation.

Existing files:
- docs/features/archive-voice-skill/README.md
- docs/features/my-x-archive-import/README.md
- docs/features/voice-rag-generation/README.md
- docs/features/smarter-generation-context/README.md
- engine/src/llm/generation-guidance.ts
- engine/src/voice/sqlite-voice-sample-provider.ts
- ../XActions/docs/features/x-voice-generation/README.md

Intent:
Use the archive/local corpus to derive stable voice rules with a cheap fast LLM batch pass. Keep evidence links to source examples, distinguish post voice from reply voice, version the derived artifact, and let generation consume it without replacing the existing fail-open Voice RAG path.

Boundaries:
Local user corpus only. No external-account voice contamination. No generated drafts/replies as training evidence. Do not remove existing Voice RAG fallback. Do not auto-post.

Workflow:
Run arch-recon first, then author tickets, then RGB/TDD through implementation. Start by pinning the current generation guidance behavior before adding the voice-skill artifact.
```
