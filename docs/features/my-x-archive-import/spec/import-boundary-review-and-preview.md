# Screen: Import Boundary Review And Preview

Stage: product-flow-spec / Stage 2 SPEC

Status: draft for review

## Purpose

Confirm the v1 import boundary, show what will be imported, and let the user resolve duplicate/re-run behavior before the engine writes data.

## Route

Review step within `/library`.

## Entry Points

- Continue from Archive Validation Preview.
- Return from repair flow after unsupported file or duplicate state.

## States

### Ideal State

- Shows boundary notice: v1 reads only selected `tweets.js`.
- Shows import preview counts: posts, replies/comments, records with timestamps, favorites, retweets, links/entities.
- Shows duplicate status if matching post IDs already exist.
- Primary action: `Import file`.

### Empty State

- Hidden until validation passes.
- If accessed directly, shows `Validate tweets.js first` with CTA back to picker.

### Loading State

- Preview aggregation and duplicate scan show skeleton rows.
- File name remains visible.

### Error State

- Duplicate scan failure: show warning and disable import until retry, unless architecture allows safe import-time dedupe.
- Preview aggregation failure: show retry and choose different file.

### Partial State

- Valid file with warnings: malformed records will be skipped.
- Existing duplicates found: show merge/update decision.
- Missing favorite/retweet fields: import allowed but weak metrics unavailable.

## Layout

```txt
Import Boundary Review And Preview
|-- Boundary Alert: tweets.js only, no folder/zip/media/deleted/private files
|-- Preview Summary
|   |-- posts / replies-comments / valid records / skipped candidate records
|   |-- favorite_count / retweet_count / created_at availability
|-- Duplicate Decision
|   |-- no duplicates OR merge/update existing records
|-- Metric Limitations
`-- actions: Import file / Back / Choose different file
```

Components referenced: `Alert`, `Badge`, `KeyValueList`, `Button`, `Switch` or radio group if duplicate policy needs choice.

## Interactions

### Area: Boundary Review

**Read boundary**
- Given: preview is visible.
- When: user scans boundary alert.
- Then: they can continue; no mandatory checkbox unless research shows confusion.
- Error: none.

### Area: Duplicate Decision

**Choose merge/update**
- Given: duplicate post IDs are detected.
- When: user chooses `Merge and update`.
- Then: import request includes duplicate policy.
- Error: if no policy selected, `Import file` remains disabled.

**Cancel duplicate import**
- Given: duplicate state is visible.
- When: user activates `Cancel`.
- Then: return to workspace with existing import unchanged.

### Area: Actions

**Import file**
- Given: preview is valid and duplicate policy is resolved.
- When: user activates `Import file`.
- Then: move to Import Progress And Summary.
- Error: if storage readiness changed, show repair alert.

## State Machines

| Current State | Event | Guard | Next State | Action / Feedback |
|---|---|---|---|---|
| Preview loading | Preview ready | no duplicates | Ready | Import enabled |
| Preview loading | Duplicates found | any | Duplicate decision | Import disabled until policy |
| Duplicate decision | Choose merge/update | any | Ready | Import enabled |
| Ready | Import | storage ready | Importing | Show progress |
| Ready | Import | storage unavailable | Repair needed | Alert + Settings action |

Impossible states:

- Import starts with unresolved duplicate policy.
- Boundary says media/profile/deleted files are included.
- `like.js` appears as a v1 metric source.

## Micro-Interactions

| Trigger | Rules | Feedback | Timing / Motion | Accessibility |
|---|---|---|---|---|
| Duplicate detected | Highlight decision row | warning badge | immediate | announce warning |
| Metric unavailable hover/focus | Explain API sync later | tooltip/helper | immediate | tooltip reachable |
| Import clicked | Prevent double submit | loading button | immediate | `aria-disabled`/busy |

## Modals And Panels

No modal required unless duplicate policy becomes destructive. If a dialog is used, focus starts on the heading, Escape closes, and focus returns to `Import file`.

## Forms

### Duplicate Policy

| Field | Type | Required | Validation | Error Message |
|---|---|---|---|---|
| Duplicate policy | radio | Only when duplicates exist | one option selected | `Choose how to handle posts already imported.` |

- Validation timing: before import.
- Submit behavior: include selected policy in import request.
- Unsaved changes: none.

## Feedback And Recovery

- Prevention: import disabled until duplicate policy resolved.
- Detection: duplicate detector based on post IDs/import hash.
- Recovery: merge/update, cancel, or choose different file.

## Content And Localization

- Copy inventory: `V1 reads only tweets.js`, `No media or deleted tweets`, `Import file`, `Merge and update`, `No impressions in archive`.
- Counts use locale formatting.
- Keep file names and field names literal.

## Accessibility

- Boundary alert should be a real alert/section but not repeatedly announced on every render.
- Duplicate radio group needs fieldset/legend.
- Import action has accessible disabled reason.

### Accessibility Test Notes

- Keyboard-only user can resolve duplicates and import.
- Screen reader hears metric limitations before import.
- Warning and unavailable states are text-labeled.

## Component References

| Component | Usage | Variant/Props |
|---|---|---|
| `Alert` | boundary and storage warning | `info`/`warning` if supported, otherwise neutral/warning |
| `Badge` | available/unavailable/duplicate states | `success`, `warning`, `uncertain` |
| `KeyValueList` | preview counts | compact |
| `Button` | import/back/retry | `primary`, `secondary`, `ghost` |
| radio group | duplicate policy | native fieldset or future component |

## Handoff Notes

- Visual specs: boundary notice should be clear but not fear-heavy.
- Interaction specs: no mandatory legal-style checkbox unless needed.
- Content specs: make `favorite_count` vs `like.js` distinction explicit if user opens help.
- Edge cases: all records duplicated, no weak metrics, no replies, mostly replies.
- Implementation dependencies: preview aggregator, duplicate detector, duplicate policy enum.

## Open Questions

- Should duplicate import default to merge/update, or require explicit selection?
- Should boundary acknowledgement be instrumented as an event?
