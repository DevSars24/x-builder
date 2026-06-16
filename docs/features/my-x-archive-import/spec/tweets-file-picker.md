# Screen: Tweets File Picker

Stage: product-flow-spec / Stage 2 SPEC

Status: draft for review

## Purpose

Let the user select the extracted `data/tweets.js` file and start validation without implying folder or zip import support.

## Route

Region within `/library`.

## Entry Points

- Primary CTA from empty Post Library state.
- Header action `Select tweets.js`.
- Repair flow after unsupported or malformed file.

## States

### Ideal State

- Native file input or accessible upload region is ready.
- Helper copy explains: `Extract your X archive, open data/, then select tweets.js.`
- Accepted file type is `.js`; UI validates shape after selection, not only extension.

### Empty State

- No file selected.
- Shows a short ordered helper:
  1. Download archive from X.
  2. Extract it.
  3. Select `data/tweets.js`.
- Primary CTA: `Choose tweets.js`.

### Loading State

- After selection, button shows loading and region says `Checking file...`.
- Do not clear selected filename while validation runs.

### Error State

- Unsupported file: `This does not look like data/tweets.js. Extract your X archive and select that file.`
- Read failure: `The file could not be read. Try selecting it again.`
- Validation errors are associated with the picker.

### Partial State

- File is selected and readable, but record count or fields are still being scanned.
- Show filename, size, and `Scanning usable fields...`.

## Layout

```txt
Tweets File Picker
|-- heading: Select tweets.js
|-- helper: extraction instructions
|-- input row: Choose file + selected filename
|-- field status: none / checking / invalid / valid
`-- secondary note: folders, zips, media, deleted tweets not supported in v1
```

Components referenced: `Input` or native file input wrapper, `Button`, `Badge`, `Alert`, `Skeleton`.

## Interactions

### Area: File Selection

**Choose file**
- Given: picker is idle.
- When: user activates `Choose tweets.js`.
- Then: native file picker opens.
- Error: if the browser blocks picker, show retryable inline error.

**Select file**
- Given: native picker is open.
- When: user selects a file.
- Then: selected filename appears and validation starts.
- Error: if file cannot be read, show picker-level error and keep CTA enabled.

**Replace file**
- Given: a file is selected or validation failed.
- When: user activates `Choose different file`.
- Then: native picker opens and previous validation result is marked stale.

## State Machines

| Current State | Event | Guard | Next State | Action / Feedback |
|---|---|---|---|---|
| Idle | Choose file | any | Picker open | Native picker |
| Picker open | Cancel | any | Idle | Preserve prior state |
| Picker open | File selected | readable | Scanning | Show selected file |
| Scanning | Shape valid | any | Validated | Render Validation Preview |
| Scanning | Shape invalid | any | Invalid | Show unsupported-file error |
| Invalid | Choose different file | any | Picker open | Retry selection |

Impossible states to prevent:

- Import preview visible before validation passes.
- Folder/zip selected and shown as valid.
- Engine receives raw archive JS for LLM extraction before deterministic parsing.

## Micro-Interactions

| Trigger | Rules | Feedback | Timing / Motion | Accessibility |
|---|---|---|---|---|
| File selected | Show basename and size | inline status | immediate | status announced politely |
| Validation starts | Disable import, not file picker | loading label | within 100ms | `aria-busy` on picker region |
| Invalid file | Keep chosen name visible | error + retry action | immediate | error linked to input |

## Modals And Panels

None.

## Forms

### File Selection Form

| Field | Type | Required | Validation | Error Message |
|---|---|---|---|---|
| `tweets.js` file | file | Yes | readable `.js` file with `window.YTD.tweets` assignment and parseable array | `Select the extracted data/tweets.js file from your X archive.` |

- Validation timing: immediately after selection.
- Submit behavior: no separate submit; validation begins on selection.
- Submit error: inline picker error.
- Unsaved changes: none.

## Feedback And Recovery

- Prevention: label explicitly names `tweets.js`.
- Detection: client can check extension/name; engine/parser validates shape.
- Message: tell user exactly which file is expected.
- Recovery: choose different file.

## Content And Localization

- Copy inventory: `Select tweets.js`, `Choose tweets.js`, `Choose different file`, `Checking file...`, `Folders and zip files are not supported in v1.`
- File paths/names should wrap or middle-truncate.
- Do not localize literal file name `tweets.js`.

## Accessibility

- Native file input must have visible label.
- If custom button triggers hidden input, label and focus behavior must remain accessible.
- Error text associated via `aria-describedby`.
- Validation result announced via polite live region.

### Accessibility Test Notes

- Keyboard-only user can open picker and replace file.
- Screen reader hears selected filename and validation result.
- Error state does not rely on red border only.

## Component References

| Component | Usage | Variant/Props |
|---|---|---|
| `Button` | choose/replace file | `primary`, `secondary` |
| `Badge` | checking/valid/invalid state | `info`, `success`, `danger` |
| `Alert` | unsupported file warning | `warning` |
| `Skeleton` | scanning state | inline |

## Handoff Notes

- Visual specs: use a functional upload row, not a large decorative dropzone.
- Interaction specs: selected file contents likely need to be sent to engine; architecture decides exact transport.
- Content specs: always say user extracts archive manually.
- Edge cases: zero-byte file, wrong JS file, huge file, repeated same file.
- Implementation dependencies: file reader/upload boundary, validation endpoint, normalized errors.

## Open Questions

- Does the client upload file contents to engine or send a user-entered local path?
- What maximum file size should show a preflight warning?
