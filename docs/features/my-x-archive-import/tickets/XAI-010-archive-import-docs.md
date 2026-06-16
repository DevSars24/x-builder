---
status: todo
---

# XAI-010: [DOC] Document archive import boundaries and local data behavior

## Goal

Update feature and user-facing docs after implementation so users understand what archive import does, what it does not do, what data stays local, and how imported history affects Studio.

## Changes

- Refresh My X Archive Import docs with final API and behavior.
- Document manual X archive extraction and selecting `data/tweets.js`.
- Explain that archive favorites/retweets are weak historical signals, not impressions.
- Explain activation/deactivation of Studio context.
- Document local storage behavior and privacy boundaries.
- Document excluded v1 surfaces: X API, OAuth, zip/folder import, media import, deleted tweets, DMs, private files, and external account scraping.

## Verification

- Docs match implemented endpoint names and UI labels.
- Docs do not mention unsupported future features as available.
- Docs keep engine behavior generic and account-neutral.
- Links from feature overview and tickets remain valid.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
