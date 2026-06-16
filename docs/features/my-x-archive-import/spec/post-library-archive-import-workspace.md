# Screen: Post Library Archive Import Workspace

Stage: product-flow-spec / Stage 2 SPEC

Status: draft for review

## Purpose

Replace the Post Library placeholder with the source-material workspace for importing `tweets.js`, reviewing results, and activating archive context for Studio.

## Route

`/library`

## Entry Points

- Sidebar Nav: Post Library.
- Direct URL: `/library`.
- Back from Settings after storage repair.
- Return from Studio active-context badge or future Voice route.

## States

### Ideal State

- Shows page header `Post Library`.
- Shows latest import status, active Studio context status, and import action.
- Main workspace is organized into sections: Import, Imported posts, Derived context.
- If an archive context is active, show `Archive context active` badge with import date and counts.

### Empty State

- Replaces old placeholder copy with a useful first-run empty state.
- Heading: `Import your X archive file`.
- Description: `Extract your X archive, then select data/tweets.js. V1 reads that file only.`
- Primary CTA: `Select tweets.js`.
- Secondary text: no X API, no folder/zip extraction, no media import.

### Loading State

- On route load, show route-level `Skeleton` for header summary and primary import region.
- Existing imported data can remain visible while a refresh loads.
- TopStatusBar continues independently.

### Error State

- Route render failure uses shell Route Error Banner.
- Import-specific load failure shows page-level `Alert` with `Retry` and `Open Settings` if storage is involved.
- Preserve selected file/import state when possible.

### Partial State

- Existing imports render, but active context may be missing, stale, or low-confidence.
- Show `Imported, not active` or `Active context stale` badge where relevant.
- If storage status is partial, keep import action visible but show warning before import starts.

## Layout

```txt
Post Library Archive Import Workspace
|-- PageHeader: Post Library
|   |-- status badges: Archive context active / No active context
|   `-- primary action: Select tweets.js
|-- Route/page alert slot
|-- Import section
|   |-- Tweets File Picker
|   |-- Archive Validation Preview
|   `-- Import Boundary Review And Preview
|-- Results section
|   |-- Import Progress And Summary
|   `-- Imported Posts Review Table
`-- Context section
    `-- Derived Insights And Studio Activation
```

Components referenced: `PageHeader`, `Button`, `Badge`, `Alert`, `EmptyState`, `Skeleton`, `KeyValueList`.

## Interactions

### Area: Header

**Select tweets.js**
- Given: user is on `/library`.
- When: user activates `Select tweets.js`.
- Then: focus moves to Tweets File Picker and native file selection starts or picker region is revealed.
- Error: if file picker cannot open, show import-scoped error with retry.

**Open Studio**
- Given: active archive context exists.
- When: user activates `Open Studio`.
- Then: navigate to `/writer`; Studio shows active archive context indicator.
- Error: if Studio render fails, shell Route Error Banner handles it.

### Area: Import Workspace

**Start new import**
- Given: an import already exists.
- When: user selects another `tweets.js`.
- Then: validation starts and duplicate/re-run rules apply after scan.
- Error: current active context remains unchanged until new import is complete and activated.

## State Machines

| Current State | Event | Guard | Next State | Action / Feedback |
|---|---|---|---|---|
| Empty | Select file | file provided | Validating | Show validation skeleton |
| Has import | Select new file | any | Validating replacement | Existing data remains visible |
| Validated | Confirm import | storage ready | Importing | Show progress |
| Imported | Activate context | confidence sufficient | Active context | Badge and Studio handoff enabled |
| Any | Storage error | import action | Repair needed | Show Alert + Settings action |

Impossible states to prevent:

- Active context points to a failed or incomplete import.
- Importing state hides existing active Studio context without user confirmation.
- Folder/zip copy appears as if supported.

## Micro-Interactions

| Trigger | Rules | Feedback | Timing / Motion | Accessibility |
|---|---|---|---|---|
| Route entry | Focus route heading | active nav marker | immediate | heading focus target |
| Active context changes | Badge updates in place | quiet success label | no animation needed | polite live region |
| New import starts | Existing context remains visible | `Importing new file` badge | immediate | status text, not color-only |

## Modals And Panels

No modal required for v1. Duplicate and boundary decisions should appear inline unless product-flow-spec review chooses a `Dialog`.

## Forms

This screen hosts the Tweets File Picker form, specified separately.

## Feedback And Recovery

- Immediate: file picker and buttons show focus/loading states.
- Inline: validation, duplicate, and boundary warnings.
- Page-level: storage/import load errors.
- System-level: optional toast only after successful activation if Toast is wired.

## Content And Localization

- Copy inventory: `Post Library`, `Import your X archive file`, `Select tweets.js`, `Archive context active`, `Imported, not active`, `Open Studio`.
- Long file names wrap or truncate middle with full value in tooltip.
- Dates use locale-aware formatting plus exact timestamp in tooltip.
- Content ownership: Archive Import owns import copy; Studio owns active-context consumption copy.

## Accessibility

- Keyboard path: route heading -> primary import action -> picker -> validation/preview actions -> results.
- Focus moves to first validation result after file scan completes.
- Use `aria-live="polite"` for import status changes.
- Status badges include text, not color-only.

### Accessibility Test Notes

- Verify `/library` is reachable by keyboard from SidebarNav.
- Verify route heading receives focus on navigation.
- Verify 200% and 400% zoom keep import CTA and warnings visible.
- Verify active context status is announced after activation.

## Component References

| Component | Usage | Variant/Props |
|---|---|---|
| `PageHeader` | route title and actions | title `Post Library` |
| `Button` | select file, open Studio, retry | `primary`, `secondary`, `ghost` |
| `Badge` | active/imported/stale states | `success`, `info`, `uncertain`, `warning` |
| `Alert` | storage/import warnings | `warning`, `danger` |
| `EmptyState` | first-run state | primary CTA |
| `Skeleton` | route/import loading | route-level |
| `KeyValueList` | import and context summary | compact rows |

## Handoff Notes

- Visual specs: dense ops-console layout; avoid marketing-style cards.
- Interaction specs: existing active context remains active until a new import is activated.
- Content specs: all copy must say `tweets.js`, not generic archive upload.
- Edge cases: direct URL, no storage, existing active context, repeated import.
- Implementation dependencies: route replacement, archive endpoints, storage readiness, active context model.

## Open Questions

- Should duplicate import confirmation be inline or a `Dialog`?
- Should the workspace use tabs later (`Imports`, `Posts`, `Context`) or start as stacked sections?
