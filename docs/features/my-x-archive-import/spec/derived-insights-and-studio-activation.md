# Screen: Derived Insights And Studio Activation

Stage: product-flow-spec / Stage 2 SPEC

Status: draft for review

## Purpose

Review archive-derived voice/profile/rotation signals and activate a bounded context snapshot that Studio can use immediately.

## Route

Region within `/library`; active context consumed by `/writer`.

## Entry Points

- `Review derived context` from Import Progress And Summary.
- Existing import summary with inactive derived context.
- Return from Studio active context indicator.

## States

### Ideal State

- Shows voice corpus summary, profile/niche hints, timing/window baseline, weak metric baseline, and rotation/repeat-history candidates.
- Shows confidence and provenance for each section.
- Primary action: `Activate for Studio`.
- After activation, shows `Archive context active` with `Open Studio`.

### Empty State

- No completed import exists.
- Shows CTA `Import tweets.js first`.

### Loading State

- Derived aggregation or LLM extraction is running.
- Deterministic sections that are ready can appear while LLM sections show skeletons.

### Error State

- Derived aggregation failed: imported posts remain usable; show retry.
- LLM extraction failed: deterministic history sections remain; voice/profile hints unavailable.
- Activation failed: keep reviewed output visible and show retry.

### Partial State

- Too few replies/comments for voice confidence.
- No weak metrics available for many records.
- Emotional-angle labels are inferred/low-confidence.
- Activation disabled only if minimum usable history is not met.

## Layout

```txt
Derived Insights And Studio Activation
|-- header: Draft archive context + confidence badge
|-- Voice evidence
|   |-- replies/comments count, standalone count, confidence
|-- Profile and niche hints
|-- Timing and windows
|   |-- posting cadence, recent windows, repeat candidates
|-- Weak performance baseline
|   |-- favorite/retweet percentiles, no impressions warning
|-- Rotation memory
|   |-- topics, structures, emotional angles
|-- Activation panel
    |-- fields included in Studio
    |-- Activate for Studio / Open Studio
```

Components referenced: `Badge`, `ScoreBar` if confidence is numeric, `KeyValueList`, `Alert`, `Button`, `details` disclosures.

## Interactions

### Area: Insight Sections

**Expand evidence**
- Given: insight section has source examples/counts.
- When: user opens the disclosure.
- Then: show source counts and representative sanitized snippets if allowed by spec.
- Error: if examples unavailable, show counts only.

**Retry extraction**
- Given: LLM extraction failed.
- When: user activates `Retry extraction`.
- Then: run extraction over reduced deterministic data.
- Error: failure keeps deterministic sections visible.

### Area: Activation

**Activate for Studio**
- Given: derived context meets minimum data threshold.
- When: user activates `Activate for Studio`.
- Then: persist active archive context and show active badge with source import id/date.
- Error: activation failure shows inline error and retry; no Studio context changes.

**Open Studio**
- Given: context is active.
- When: user activates `Open Studio`.
- Then: navigate to `/writer`; Studio shows active archive context indicator and uses context in analysis.
- Error: if Studio cannot load, shell Route Error Banner handles it.

## State Machines

| Current State | Event | Guard | Next State | Action / Feedback |
|---|---|---|---|---|
| Imported | Derive deterministic insights | any | Deterministic ready | Show cadence/metrics |
| Deterministic ready | LLM extraction starts | LLM available | Extracting | Show skeleton for voice/profile hints |
| Extracting | Success | any | Review ready | Show all available sections |
| Extracting | Failure | any | Review partial | Show retry extraction |
| Review ready | Activate | min data met | Activating | Button loading |
| Activating | Success | any | Active | Active badge + Open Studio |
| Activating | Failure | any | Activation error | Retry, keep review visible |

Impossible states:

- Studio claims archive context active before activation succeeds.
- Voice/profile hints overwrite Settings `accountProfile` silently.
- Impression prediction claims measured impressions from archive.

## Micro-Interactions

| Trigger | Rules | Feedback | Timing / Motion | Accessibility |
|---|---|---|---|---|
| Low confidence section | Use badge + helper text | uncertain/warning badge | immediate | text explains why |
| Activation success | Update badge and CTA | success badge | immediate | polite announcement |
| Open Studio | Route change | active nav update | immediate | focus Studio heading |

## Modals And Panels

No modal required. Activation confirmation is inline because it is reversible by activating a later import or disabling archive context later.

## Forms

No editable form in v1. Full voice/profile editing belongs to `voice-profile`.

## Feedback And Recovery

- Missing/low evidence: section-level warnings, not fatal.
- Activation disabled: name missing minimum, e.g. `Need at least 20 imported authored records or 10 replies/comments.`
- Activation failure: retry without re-running import.
- Studio integration unavailable: show active context saved but `Studio integration pending` only if architecture makes this possible; otherwise activation should not be exposed.

## Content And Localization

- Copy inventory: `Draft archive context`, `Activate for Studio`, `Archive context active`, `No impressions in archive`, `Replies/comments are stronger voice evidence`, `Open Studio`.
- Long lists of topics/angles truncate after N with `Show all`.
- Numbers and dates are locale-aware.
- Literal model/source ids stay mono.

## Accessibility

- Insight sections use headings and disclosures.
- Activation status announced politely.
- Buttons have explicit labels, not icon-only.
- Confidence is text + number/badge, never color-only.

### Accessibility Test Notes

- Keyboard-only user can expand sections and activate context.
- Screen reader hears activation success/failure.
- Low-confidence warnings are announced as part of section content.
- Zoom does not make action panel overlap insight content.

## Component References

| Component | Usage | Variant/Props |
|---|---|---|
| `Badge` | confidence, active, inferred, unavailable | `success`, `info`, `warning`, `uncertain` |
| `KeyValueList` | counts and baselines | compact |
| `Alert` | no impressions, low evidence, activation failure | `warning`, `danger` |
| `Button` | activate/open Studio/retry | `primary`, `secondary`, `ghost` |
| `ScoreBar` | optional confidence display | numeric + label if used |
| `details` | evidence expansion | native disclosure |

## Handoff Notes

- Visual specs: activation panel must be clearly operational, not a decorative card.
- Interaction specs: activation is a separate action after review.
- Content specs: archive-derived profile hints are not the same as Settings account profile.
- Edge cases: mostly replies, no replies, no favorites/retweets, LLM unavailable, re-import changes active context.
- Implementation dependencies: derived insight schema, active context persistence, Studio analysis context integration.

## Open Questions

- What is the minimum threshold to enable activation?
- Which active fields are v1: voice hints, niche/profile hints, repeat history, weak metric percentiles, emotional-angle rotation?
- Should users be able to deactivate archive context from Library, Studio, or Settings?
