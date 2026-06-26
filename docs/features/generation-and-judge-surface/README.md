---
status: implemented
---

# Generation & Judge Surface

The shipped overlay surface that turns the LLM judge from a read-only verdict into an authoring loop: generate a draft, judge it, apply every fix in one click, and ground all of it in your account. Built across the X Overlay Browser epic (XOB-010..013, 024, 026, 027) and the codex-adapter extension; documented here because the individual tickets never got a feature-level write-up.

## What it does

### Generate (grounded drafts)
The rail on the left of the cockpit (`overlay/src/compose/compose-generate-rail.tsx`) offers per-format generate buttons. Each draft is written by `engine/src/llm/generate-ideas-service.ts`, grounded in:

- a **reach playbook** — the markdown knowledge base at `knowledgeBasePath` (which formats travel and why), and
- **your captured voice** — recent real posts from the corpus.

Generated drafts are auto-judged, highlighted **green** in the composer, and labelled **✓ Judge approved** when they pass — so a machine-written, vetted draft is visually distinct from what you typed (blue spans are judge fix-highlights on your own text).

### Apply all suggestions
`engine/src/llm/apply-judge-suggestions-service.ts` (`POST /drafts/apply-suggestions`) takes the current verdict, rewrites the draft applying every inline fix, **re-judges** the rewrite, and keeps it **only if it scores better** (never-worse guard). One click, no manual span-by-span editing. The verdict and green/blue provenance re-pin to the new text.

### Inline span annotations
The judge (`engine/src/llm/judge-draft-service.ts`, `verdictOutputSchema`) returns span-level annotations, not just prose. The highlight layer (`overlay/src/highlight/`) underlines the flagged phrase in the composer via `Range`→`getClientRects`; hover shows the fix. This is what makes "apply all" meaningful — the fixes are anchored to real spans.

### Account profile
The `accountProfile` setting (free text describing your audience/positioning) feeds the judge's audience-match dimension. It's the manual complement to the corpus-derived signals — set in the Settings panel, stored in `settings.json`.

## Boundary

- **Never auto-posts.** Generation and apply only write to the composer; you press X's Post.
- **In-process.** Generate/judge/apply all run through the engine over the transport seam, via the selected CLI provider (`codex` / `claude` / `cursor`). No hosted API.
- **Calibrated to you.** Voice and account profile personalize output per account.

## Direction — smarter generation context

Today `generate-ideas-service` sends the LLM the **whole** knowledge base (~23KB) plus a voice sample on every call. The active direction is to send only the **relevant slice** of the playbook for the requested format plus a tight, representative voice sample — cheaper, faster, and less prone to the model drowning in unrelated guidance. This is tracked as a generation-context-trimming follow-up, not a ticketed epic.

## Code map

| Piece | Where |
|---|---|
| Generate service | `engine/src/llm/generate-ideas-service.ts`, `engine/src/suggest/generate-category-service.ts` |
| Apply-suggestions service | `engine/src/llm/apply-judge-suggestions-service.ts` |
| Judge + span annotations | `engine/src/llm/judge-draft-service.ts`, `shared/src/schemas/judge.ts` |
| CLI providers | `engine/src/llm/{codex,claude,cursor}-cli-provider.ts` behind `structured-llm-service.ts` |
| Generate rail (UI) | `overlay/src/compose/compose-generate-rail.tsx` |
| Judge strip (UI) | `overlay/src/judge/judge-strip.tsx` |
| Highlight layer (UI) | `overlay/src/highlight/` |
| Account profile setting | `shared/src/schemas/shell.ts` (`accountProfile`), Settings panel |

See also: [llm-judge](../llm-judge/), [codex-adapter](../codex-adapter/), [deterministic-engine](../deterministic-engine/).
