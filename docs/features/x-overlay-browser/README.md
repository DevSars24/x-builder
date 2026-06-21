---
status: shaping
---

# X Overlay Browser

Purpose: move X Builder from a separate writer studio into an assistive overlay that runs directly on top of X, so users can inspect posts, draft replies, score ideas, and apply archive-derived context where the work already happens.

This document is shape-giving input for the next `arch-recon` run. It records the current product direction, research findings, comparison criteria, and open architecture questions. It is not a final architecture spec, product-flow map, or ticket breakdown.

## Pivot Summary

The previous product shape centered on an internal `/writer` studio. That studio can generate and score post drafts, import an X archive, derive compact historical context, and judge drafts. The new direction is to make the primary surface an overlay on `x.com`.

The core user moment becomes:

1. User opens X through X Builder.
2. User clicks or focuses a visible post, reply box, thread, or profile context.
3. X Builder shows recommendations in place: whether to reply, suggested reply angles, risk notes, draft score, and voice/context fit.
4. User stays in control of final actions on X.

The system should remain open-source friendly and local-first for the first slice.

## Directions Compared

Two setup directions were explored:

- **Playwright-controlled local browser**: user runs a local command, X Builder opens a dedicated Chromium/Chrome profile, injects overlay UI, and connects the overlay to the local engine.
- **Chrome extension**: user installs an extension that injects overlay UI into the user's normal Chrome/X session and connects to either a hosted backend or local native bridge.

The current conclusion is:

- Use **Playwright-controlled local browser** for the open-source/local product.
- Keep the overlay runtime portable enough that a later Chrome extension can reuse it if the product becomes a deployed SaaS.

## Decision Matrix

| Criterion | Playwright-Controlled Browser | Chrome Extension |
|---|---|---|
| Most frictionless onboarding, local/free | Strong for technical users: one command can start the engine, open X, and preserve a dedicated login profile. | Weak unless published. Local use requires loading an unpacked extension and possibly running a local backend/native host. |
| Most frictionless onboarding, deployed/sold | Weaker: asks users to install/run a local app and log into a separate browser profile. | Strong: store install, works in the user's existing browser session. |
| Best UX, local/free | Good after first run, but separate browser profile is visible friction. | Poor in dev/unpacked mode; good only after store distribution. |
| Best UX, deployed/sold | Good for power users, less natural for mainstream buyers. | Best long-term SaaS UX: existing X session, extension toolbar, native side panel, content scripts. |
| Overlay UI | Strong. Runtime can inject JS/CSS into pages and mount custom in-page panels. | Strong. Content scripts can read and modify page DOM. |
| Local engine access | Strong. Overlay can call Playwright-exposed bindings or local HTTP directly. | More plumbing. Needs extension messaging to service worker, fetch to localhost, or native messaging host. |
| Browser automation/control | Very strong. Playwright and CDP can inspect, click, type, capture screenshots, observe requests, and manage downloads. | Limited unless using sensitive APIs such as `chrome.debugger`, which adds UX/review risk. |
| Archive upload and local files | Strong. Local app can read files and store normalized data under engine storage. | Browser file picker is possible, but large local persistence or engine execution needs backend/native bridge. |
| Speed of development | Fastest path. Reuse current engine, inject overlay, add a Python/Node runner. | Slower. Requires MV3 manifest, service worker lifecycle, permission model, content-script messaging, review constraints. |
| Local/dev mode | Natural. The dev mode is the product mode. | Unpacked extension dev mode is not representative of buyer onboarding. |
| Ease of deployment | Easy for OSS: PyPI/uv/GitHub release. | Easy for users only after Chrome Web Store approval; harder before. |
| Cost of distribution | Low direct cost. Higher support cost for local environments. | Low store fee, but hosted backend/model costs if sold as SaaS. Review/policy cost is non-trivial. |

## Research Findings

### Playwright / Local Browser

- Playwright supports persistent browser contexts using a `user_data_dir`, which stores browser session data like cookies and local storage. This enables "log in once" behavior for a dedicated X Builder browser profile.
- Playwright can launch branded Chrome or bundled Chromium, but current Chrome guidance warns against automating the user's default Chrome profile.
- Chrome 136 changed remote debugging behavior so `--remote-debugging-port` and `--remote-debugging-pipe` are no longer respected against the default Chrome data directory; automation/debugging should use a separate user data directory.
- Playwright can expose local callbacks into the page and inject scripts across navigations. This is a direct fit for overlay-to-local-engine calls.
- Chrome DevTools Protocol gives broad browser instrumentation access across DOM, Runtime, Network, Input, Page, Storage, and related domains. Playwright should be the first abstraction; raw CDP should be a fallback for advanced needs.

References:

- [Playwright persistent context](https://playwright.dev/python/docs/api/class-browsertype#browser-type-launch-persistent-context)
- [Playwright expose binding](https://playwright.dev/python/docs/api/class-page#page-expose-binding)
- [Chrome remote debugging profile change](https://developer.chrome.com/blog/remote-debugging-port)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

### Chrome Extension

- Content scripts can read and change page DOM, which is sufficient for in-page overlays.
- Content scripts run in isolated worlds and communicate with extension pages/service workers through message passing.
- The Side Panel API can provide a persistent companion UI alongside the current page, which is attractive for a future SaaS version.
- Extension service workers can unload when dormant, which affects long-running state and requires careful messaging/state design.
- Cross-origin backend calls require host permissions. Broad host permissions and sensitive permissions can increase Chrome Web Store review time.
- Native messaging can bridge an extension to a local process, but requires platform-specific native host registration and is not available directly from content scripts.
- Manifest V3 does not allow remotely hosted executable code. Extension logic must be bundled and reviewable.
- Chrome Web Store publication requires a developer account and review. New extensions, broad permissions, and significant code changes can increase review time.

References:

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome side panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Extension service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)
- [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Manifest V3 remote code requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Chrome Web Store review process](https://developer.chrome.com/docs/webstore/review-process)

### X Policy Boundary

Both approaches must stay assistive, not autonomous.

X automation rules warn against non-API scripting of the X website and state that AI-powered automated reply bots require prior written approval. The first product slice should not auto-post, auto-like, auto-follow, auto-DM, mass reply, or perform actions that surprise the user.

Allowed product posture for v1:

- analyze visible content;
- suggest reply angles;
- score drafts;
- optionally fill a reply composer after an explicit user click;
- require the user to manually post, like, repost, follow, or send.

Reference:

- [X automation rules](https://help.x.com/en/rules-and-policies/x-automation)

## Proposed Product Shape

First slice:

```txt
local x-builder runner
  starts/uses local engine
  launches dedicated browser profile
  opens x.com
  injects shared overlay runtime
  observes visible posts and reply boxes
  sends selected context to local engine
  renders recommendations in place
```

The user-facing command should eventually feel like:

```txt
uvx x-builder
```

The exact package manager, command name, and runtime packaging are architecture questions.

## Overlay Capabilities To Support

Minimum:

- detect X post cards in the timeline, thread, profile, and detail views;
- detect active reply composer and draft text;
- inject a small action affordance near a post or composer;
- open a recommendation card anchored to the selected post/composer;
- call the local engine for scoring, judging, and recommendations;
- show local engine/LLM readiness;
- upload or select archive file from settings overlay;
- persist user settings and active archive context locally.

Near-term:

- "Should I reply?" score for a visible post;
- reply angle suggestions;
- draft score while typing;
- "make it more me" rewrite suggestions;
- "use this as a voice example" marking;
- thread-level context extraction;
- profile-level lightweight context extraction;
- confidence and privacy indicators.

Later:

- portable extension version using the same overlay runtime;
- optional hosted backend;
- optional extension side panel;
- local/remote model selection;
- more robust DOM extraction layer using a browser-agent library only where deterministic selectors are insufficient.

## Reuse From Current System

Reuse as much as possible:

- archive import contracts and parser;
- canonical post library repository;
- derived archive context service;
- deterministic post scoring;
- judge provider abstraction;
- settings persistence;
- shared Zod contracts;
- existing client design tokens/components where useful for overlay UI.

Reframe:

- `/writer` becomes a fallback/internal studio, not the primary experience.
- `/library` archive import becomes an overlay settings flow or local settings page reachable from the overlay.
- active archive context becomes a local personalization layer for X-page recommendations.

## Architecture Context For Next Recon

The next `arch-recon` run should inspect and decide:

- whether the runner should be Python-first, Node-first, or split;
- whether to keep the existing Fastify engine as-is and add a separate browser runner package;
- whether overlay UI should be built as plain JS, React bundle, or reused client components;
- how the overlay runtime should communicate with local engine: Playwright binding, localhost HTTP, WebSocket, or a small bridge protocol;
- how browser profile state is stored and upgraded;
- how to package Playwright browsers and avoid a painful first install;
- how to run provider readiness checks from the local overlay;
- how archive upload works from injected UI without leaking raw archive content;
- how to structure code so a future Chrome extension can reuse the overlay runtime;
- which parts of current client routes become dead, fallback, or reusable.

## Non-Goals For The First Slice

- No Chrome extension implementation.
- No hosted backend.
- No X OAuth.
- No X API dependency.
- No autonomous posting, liking, following, reposting, or direct messaging.
- No automation that performs X account actions without an explicit user gesture.
- No scraping of private areas such as DMs.
- No attempt to automate the user's default Chrome profile.
- No full voice-profile editor unless needed to prove overlay value.

## Open Questions

- Is the first target user comfortable logging into X inside a dedicated browser profile?
- Should the dedicated profile use bundled Chromium, Chrome for Testing, or installed Chrome?
- What is the minimum install command that works reliably across macOS, Linux, and Windows?
- Should the first runner be a Python package because Playwright Python fits the one-command local story, or should it stay in the existing Node/pnpm workspace?
- How much of the current React UI can be reused without making overlay injection heavy?
- Should the overlay be shadow-DOM isolated to avoid X CSS collisions?
- How should the system handle X DOM changes without turning into a brittle selector project?
- Where is the policy line between "fill composer after explicit click" and "automated website scripting"?
- Should a later SaaS version be extension-first, or should the local browser remain the open-source product forever?

## Suggested Next Pipeline Step

Run `arch-recon` on this feature with focus on:

1. local browser runner architecture;
2. overlay runtime packaging and injection;
3. local engine reuse boundary;
4. future extension portability;
5. X policy and user-action safety boundaries.

The expected output is an architecture report and ticketable implementation path, not a broad product-flow map yet.
