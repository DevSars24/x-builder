# What we're building

**An AI writing coach that lives inside x.com.** Writing on X is a black box — you can't tell whether a post will reach before you publish it. x-builder is a local tool that gives you a sharp second opinion *in the composer*, calibrated to your own account, before you press Post.

It runs on your machine and never posts for you. A local Playwright runner attaches to your own logged-in Chrome and injects a React overlay onto x.com's composer; the scoring engine runs in-process. As you write — or generate — a draft, you get:

- **A live deterministic score** (no LLM, instant): a reach prediction calibrated to your follower count + trailing performance, plus Post Coach checks (hook, tension, quotability, hedging…).
- **An on-demand LLM judge**: a 13-dimension verdict with inline span fixes and a one-click "apply all suggestions" rewrite. It runs through a CLI you already have (Codex / Claude / Cursor), so there's no hosted API.
- **Grounded generation**: drafts written to follow a reach playbook (which formats actually travel) and your own voice.
- **Cooldown nudges**: a warning when you're overusing a format (repetition decays reach).

## How it learns you

Everything is calibrated to **your** account, from a local corpus of your own posts. The corpus is built from **two independent enrichment sources**:

1. **Passive profile capture (default).** While the runner is attached, it reads the posts X already fetches as you browse your profile — no extra work, growing as you scroll.
2. **Archive import (optional fast-start).** A one-time `tweets.js` import from your X data export loads your full history at once, so the reach baseline and voice are deep on day one.

The corpus drives voice (generation examples), cooldowns (format repetition), and your reach baseline (so the reach prediction reflects *your* numbers, not a generic curve).

## The loop

```
browse x.com → corpus → score / judge / generate (grounded) → you post
     ▲                                                            │
     └──────────────── enriches the corpus ──────────────────────┘
```

## Principles

- **Local & private** — your session, your machine; no hosted account or publishing token.
- **Never auto-posts** — the overlay fills the composer only on your click; you press X's Post button.
- **Calibrated to you** — voice, reach baseline, and cadence are per your account.
- **Heuristics, not guarantees** — a structured second read, not a prediction of real numbers.

## What it is not

Not a scheduler, not a publisher, not a hosted social tool. It's a private writing studio that lives where you actually write.

## Status & direction

The overlay product is built end-to-end (capture → score → judge → generate). Active directions: a closed **feedback loop** (compare what the engine predicted to how a post actually performed, and surface what's working for *you*); smarter **generation context** (send the LLM only the relevant slice of the playbook + a tight voice sample instead of the whole knowledge base); and per-account corpus scoping.
