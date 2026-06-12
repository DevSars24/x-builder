---
title: Choose a judge provider
description: Pick which CLI coding agent runs the Draft Judge — Codex, Claude, or Cursor — and get it ready to score your drafts.
---

## Choose a judge provider

The Draft Judge scores your draft and shows a verdict. You decide **which CLI coding agent does the scoring** — Codex, Claude Code, or Cursor. This guide shows you how to pick a provider, get it ready, read its status, and recover when it is not usable.

## Pick a provider

1. Open the **Settings** page.
2. Find the **Judge provider** select and choose one of:
   - **Codex judge** (default)
   - **Claude judge**
   - **Cursor judge**
3. Click **Save**.
4. Click **Test readiness** to confirm the provider is usable.

Your choice takes effect on the next judge run or status check — there is no need to restart the app.

When the judge runs, the verdict is attributed to the provider you picked, for example "Judged by Claude judge."

## What each provider requires

A provider is usable only when its CLI is **installed** and **authenticated**. Set up the one you selected.

| Provider | Display name | CLI + auth | Model field + example |
| --- | --- | --- | --- |
| Codex | **Codex judge** | `codex` installed; sign in with `codex login` | **Codex model** — `gpt-5.2-codex` |
| Claude Code | **Claude judge** | `claude` installed; sign in (keychain/OAuth) **or** set `ANTHROPIC_API_KEY` | **Claude model** — `sonnet` |
| Cursor | **Cursor judge** | `cursor-agent` installed; sign in with `cursor-agent login` **or** set `CURSOR_API_KEY` | **Cursor model** — `auto` |

### Codex judge

Install the Codex CLI, then sign in:

```sh
codex login
```

### Claude judge

Install the Claude Code CLI, then authenticate either by signing in with the normal `claude` sign-in (keychain/OAuth) **or** by setting an API key in your environment:

```sh
export ANTHROPIC_API_KEY="your-api-key"
```

### Cursor judge

Install the Cursor CLI, then authenticate either by signing in:

```sh
cursor-agent login
```

**or** by setting an API key in your environment:

```sh
export CURSOR_API_KEY="your-api-key"
```

## Read the status badge

The top status bar shows one **judge** badge for the provider you selected:

- **"<Provider> judge ready"** (e.g. "Claude judge ready") — the CLI is installed and responsive.
- **"<Provider> judge unavailable"** — the CLI is not usable. The badge shows a message and an **Open Settings** affordance.

Only the selected provider matters. When it is unavailable, the overall app status reads **partial** — that means "the provider you configured isn't usable right now." It does **not** mean all three CLIs must be installed; you only need the one you picked.

### "Ready" checks presence, not sign-in

"Ready" means the selected CLI is **installed and responds** to a quick version check. It does **not** verify that your sign-in or API key is valid.

So if the CLI is present but your auth is bad, the badge still reads "ready." The failure shows up only when you actually judge a draft, as a **retryable** error:

> The judge could not score this draft. Try again.

If the badge says ready but judging fails, check your provider sign-in or API key.

## Recover when the provider is unavailable

When the selected provider is unavailable, the **Judge draft** button is disabled with the hint:

> The judge is unavailable right now. Check the provider in Settings.

To recover:

1. Install and authenticate the selected CLI (see [What each provider requires](#what-each-provider-requires)) — **or** switch to a different provider in Settings.
2. Click **Save**.
3. Click **Test readiness**.

## Choose a model per provider (optional)

Under the **Judge provider** select are three optional model fields — **Codex model**, **Claude model**, and **Cursor model** — each with the helper text "Leave empty to use the provider's default."

- **Leave a field empty** to use that CLI's default model.
- Only the field for the **currently-selected provider** affects judging.
- Model names differ per CLI and must match that CLI's own catalog.

| Provider | Model family / how to find names | Example |
| --- | --- | --- |
| Codex | The `gpt-5.x-codex` family | `gpt-5.2-codex` |
| Claude | Aliases `haiku` / `sonnet` / `opus`, or a full Anthropic model id | `sonnet` |
| Cursor | Its own catalog — list it with the command below | `auto`, `gpt-5.3-codex` |

List the Cursor catalog:

```sh
cursor-agent --list-models
```

### Edge case: an invalid model name

The app does **not** validate the model name you enter. If the name is wrong, the CLI rejects it when you judge, and it surfaces as the standard judge error — **non-retryable** in this case, because retrying with the same invalid name will fail again. Fix the model name (or clear the field to use the default), then judge again.

## Privacy and trust

Judging sends your draft to the **selected provider's service**. Choosing **Claude judge** or **Cursor judge** sends drafts to those third-party services (Anthropic and Cursor) — the **same trust class** as Codex. Pick the provider you are comfortable sending your draft text to.

<!-- Tickets: CAD-007..016 — multi-provider judge — verified against the shipped feature 2026-06-12 -->
