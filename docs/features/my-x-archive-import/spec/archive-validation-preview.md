# Screen: Archive Validation Preview

Stage: product-flow-spec / Stage 2 SPEC

Status: draft for review

## Purpose

Show whether the selected `tweets.js` is usable and what fields the import can extract before the user confirms import.

## Route

Panel within `/library`.

## Entry Points

- Appears after Tweets File Picker starts validation.
- Reappears from repair after selecting a replacement file.

## States

### Ideal State

- Shows `Valid tweets.js` badge.
- Shows record count, original/reply split if cheaply available, selected filename, file size, detected assignment path, and usable fields.
- Shows unavailable metrics: impressions, profile clicks, bookmarks, link clicks.
- Primary action: `Continue`.

### Empty State

- Hidden until a file is selected.
- If rendered independently, shows `No file selected` and CTA `Choose tweets.js`.

### Loading State

- Skeleton rows for file name, record count, and usable fields.
- Status text: `Scanning selected file...`.

### Error State

- Unsupported shape or parse failure shows `This file cannot be imported`.
- Include safe detail such as missing assignment or invalid JSON slice, without showing private post text.
- Recovery: `Choose different file`.

### Partial State

- File is parseable, but some records are malformed.
- Show import can proceed with skipped-record warnings if required fields exist.
- Continue remains enabled if enough valid records exist.

## Layout

```txt
Archive Validation Preview
|-- status row: Valid / Invalid / Partial
|-- file facts: name, size, detected assignment, record count
|-- usable fields: id, full_text, created_at, favorite_count, retweet_count, reply refs
|-- unavailable metrics: impressions, profile clicks, bookmarks, link clicks
|-- warnings list
`-- actions: Continue / Choose different file
```

Components referenced: `Badge`, `KeyValueList`, `Alert`, `Button`, `Skeleton`.

## Interactions

### Area: Validation Result

**Continue**
- Given: selected file is valid enough to import.
- When: user activates `Continue`.
- Then: advance to Import Boundary Review And Preview.
- Error: if validation result expires because file changed, re-run validation.

**Choose different file**
- Given: validation is invalid, partial, or user wants replacement.
- When: user activates `Choose different file`.
- Then: focus returns to Tweets File Picker.

## State Machines

| Current State | Event | Guard | Next State | Action / Feedback |
|---|---|---|---|---|
| Loading | Validation success | valid records > 0 | Valid | Enable Continue |
| Loading | Validation partial | valid records > 0 and warnings | Partial | Enable Continue + warnings |
| Loading | Validation fail | no usable records | Error | Disable Continue |
| Valid | File replaced | any | Loading | Clear stale result |

Impossible states:

- `Continue` enabled with zero usable post records.
- Unavailable metrics shown as imported.
- Post text displayed in validation errors.

## Micro-Interactions

| Trigger | Rules | Feedback | Timing / Motion | Accessibility |
|---|---|---|---|---|
| Validation success | Keep panel height stable | success badge | immediate | polite status |
| Warning row focus | Explain warning | tooltip or inline helper | no animation | keyboard reachable |
| Continue clicked | Move to next section | next section receives focus | immediate | focus target heading |

## Modals And Panels

None.

## Forms

None.

## Feedback And Recovery

- Invalid: choose different file.
- Partial: continue with warnings; skipped records listed in summary later.
- Stale: revalidate automatically after file replacement.

## Content And Localization

- Copy inventory: `Valid tweets.js`, `Partial import possible`, `This file cannot be imported`, `Usable fields`, `Unavailable from archive`.
- Use locale number formatting for record counts.
- Keep technical assignment names in mono text.

## Accessibility

- Validation status is announced once.
- Use list/table semantics for usable and unavailable fields.
- Warnings include text labels and do not rely on badge color.

### Accessibility Test Notes

- Screen reader can distinguish valid/partial/error.
- Continue is disabled with an accessible reason when invalid.
- Long file names do not push actions off-screen.

## Component References

| Component | Usage | Variant/Props |
|---|---|---|
| `Badge` | validation and field availability | `success`, `warning`, `danger`, `uncertain` |
| `KeyValueList` | file facts | compact |
| `Alert` | invalid/partial warnings | `warning`, `danger` |
| `Button` | continue/reselect | `primary`, `secondary` |
| `Skeleton` | scanning state | row skeletons |

## Handoff Notes

- Visual specs: dense summary, not a file explorer.
- Interaction specs: invalid result never progresses to import preview.
- Content specs: unavailable metrics copy must mention X API sync later without selling it.
- Edge cases: zero records, malformed records, huge file, future multipart file.
- Implementation dependencies: validation parser, error taxonomy, field availability model.

## Open Questions

- Should the validation preview calculate original/reply split here or defer to import summary?
- What parse warnings are safe to expose without leaking post content?
