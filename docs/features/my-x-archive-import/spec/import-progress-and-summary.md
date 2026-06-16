# Screen: Import Progress And Summary

Stage: product-flow-spec / Stage 2 SPEC

Status: draft for review

## Purpose

Show deterministic parsing, optional LLM extraction, persistence progress, and the final import summary for the selected `tweets.js`.

## Route

Region within `/library`.

## Entry Points

- `Import file` from Import Boundary Review And Preview.
- Retry after storage or parser repair.
- Merge/update re-run.

## States

### Ideal State

- Completed summary shows import run id/source, imported count, skipped count, duplicates updated, favorite/retweet coverage, timestamp coverage, reply/original split, and warnings.
- Shows `Review derived context` action.
- Imported Posts Review Table shows first page of imported records.

### Empty State

- Before import starts, this region is hidden or shows `No import has run yet`.
- CTA returns to picker.

### Loading State

- Progress phases:
  1. `Parsing tweets.js`
  2. `Normalizing posts and replies`
  3. `Saving imported records`
  4. `Extracting draft context` if LLM extraction runs
- Use stable progress list, not a fake precise percentage unless backend provides one.

### Error State

- Parse failure: selected file not imported; show file-safe error and `Choose different file`.
- Storage failure: import not marked complete; show `Open Settings` and `Retry`.
- LLM extraction failure: deterministic import still succeeds; derived context unavailable with retry later.

### Partial State

- Import succeeds with skipped malformed records.
- Import succeeds but LLM extraction unavailable.
- Import succeeds with weak metrics missing from some records.

## Layout

```txt
Import Progress And Summary
|-- Progress panel OR Summary panel
|-- Summary facts: records imported, skipped, duplicates, metric coverage
|-- Warnings: missing metrics, skipped records, LLM extraction unavailable
|-- Imported Posts Review Table
`-- actions: Review derived context / Import another file / Open Settings / Retry
```

Components referenced: `Skeleton`, `Badge`, `Alert`, `KeyValueList`, `Button`, table/list pattern.

## Interactions

### Area: Import Progress

**Cancel import**
- Given: import is running and backend supports cancellation before persistence.
- When: user activates `Cancel`.
- Then: import stops and selected file import is not marked complete.
- Error: if cancellation is too late, show `Finishing current write...` or disable cancel.

**Retry import**
- Given: parse/storage failure occurred.
- When: user activates `Retry`.
- Then: retry from last safe pre-write point or full selected file import.
- Error: repeated failure keeps error visible.

### Area: Summary

**Review derived context**
- Given: import completed.
- When: user activates `Review derived context`.
- Then: focus moves to Derived Insights And Studio Activation.

**Import another file**
- Given: import completed or failed.
- When: user activates `Import another file`.
- Then: reset picker/validation flow without deleting completed import.

## State Machines

| Current State | Event | Guard | Next State | Action / Feedback |
|---|---|---|---|---|
| Ready to import | Start | storage ready | Parsing | Start import run |
| Parsing | Parse success | any | Normalizing | Progress phase update |
| Normalizing | Normalize success | any | Saving | Progress phase update |
| Saving | Persist success | LLM enabled | Extracting context | Run LLM over reduced data |
| Saving | Persist success | LLM disabled | Completed | Show summary |
| Extracting context | Success | any | Completed | Show summary + insights ready |
| Extracting context | Fail | deterministic import complete | Completed partial | Show LLM warning |
| Any active phase | Fatal error | no complete import | Failed | Show recovery |

Impossible states:

- Completed summary shown for failed persistence.
- LLM extraction failure rolls back deterministic import.
- Active Studio context updates before user activation.

## Micro-Interactions

| Trigger | Rules | Feedback | Timing / Motion | Accessibility |
|---|---|---|---|---|
| Phase changes | Announce phase only | phase badge/list update | immediate | polite live region |
| Completion | Move focus to summary heading | success badge | immediate | announce counts |
| Skipped records expanded | Show reasons | disclosure opens | no animation required | keyboard reachable |

## Modals And Panels

No modal required. Skipped-record details can use an inline disclosure.

## Forms

None.

## Feedback And Recovery

- Parse failure: choose different file.
- Storage failure: open Settings; preserve selected file if possible.
- LLM failure: allow retry extraction later; do not block import.
- Skipped records: show reason counts, not raw private text by default.

## Content And Localization

- Copy inventory: `Parsing tweets.js`, `Saving imported records`, `Extracting draft context`, `Imported`, `Skipped`, `Duplicates updated`, `Weak metrics available`.
- Counts use locale formatting.
- Timestamps use locale date/time; source ids remain mono.

## Accessibility

- Progress phase list uses `aria-live="polite"`.
- Do not announce every record.
- Summary counts use text labels.
- Imported Posts Review Table must be navigable by keyboard or use a simple list until DataTable exists.

### Accessibility Test Notes

- Screen reader hears completion and fatal errors.
- Retry and Settings actions are reachable after errors.
- Skipped-record disclosure works by keyboard.

## Component References

| Component | Usage | Variant/Props |
|---|---|---|
| `Skeleton` | progress/loading | phase rows |
| `Badge` | phase/success/warning states | `info`, `success`, `warning`, `uncertain` |
| `Alert` | fatal and partial warnings | `danger`, `warning` |
| `KeyValueList` | import summary counts | compact |
| `Button` | retry/settings/review/import another | `primary`, `secondary`, `ghost` |
| table/list | imported posts preview | DataTable needed or simple list fallback |

## Handoff Notes

- Visual specs: keep progress stable; avoid fake progress bars.
- Interaction specs: import is a selected-file unit; malformed records can skip, failed persistence cannot claim completion.
- Content specs: never print raw post text in errors.
- Edge cases: mostly replies, zero originals, no weak metrics, LLM unavailable.
- Implementation dependencies: import run lifecycle, selected-file transaction, optional LLM extraction contract, storage errors.

## Open Questions

- Is cancellation supported after import starts?
- Does imported post preview require a full DataTable in this feature or a compact list first?
