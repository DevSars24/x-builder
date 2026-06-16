# My X API Sync

Purpose: connect a user's X account through official API access and keep recent posts, profile data, and performance metrics updated after the archive import baseline exists.

## Boundary

This feature is the paid, ongoing synchronization path. It should update the same local data model seeded by `my-x-archive-import`, not create a parallel source of truth.

It should keep X integration generic and faceless: no account-specific assumptions, no private strategy hard-coding, and no claims that the app knows the live X ranking algorithm.

## Primary Inputs

- User-authenticated X API connection.
- Current user profile fields and public metrics.
- Recent authored posts, replies, reposts, quotes, and post metadata.
- Requested post fields such as `created_at`, `author_id`, `conversation_id`, `entities`, `attachments`, `public_metrics`, `referenced_tweets`, and `context_annotations` when available.
- Owned-post metrics available through user context, such as non-public or organic metrics when the plan and permissions allow them.
- Optional X Activity events for post/profile/follow changes if they are worth the operational cost.

## Expected Outputs

- Daily or user-triggered sync status with last successful sync time, next planned sync, records updated, and API usage/cost state.
- Recent post performance snapshots, including impressions where available.
- Full public metric snapshots when available: impressions, likes, replies, reposts, quotes, and bookmarks.
- Owned-post private metric snapshots when available: profile clicks, URL clicks, engagements, organic impressions, and organic engagement breakdown.
- Current profile snapshot: bio, display name, handle, follower/following counts, post count, pinned post, profile image/header references, and verification/subscription fields if exposed.
- Recent cadence and fatigue signals for deterministic scoring.
- Post rotation memory: what was posted recently, what structure/topic/angle was used, and whether a similar candidate is too soon.
- Sync quality report: fields available, fields unavailable, auth state, retention limits, and confidence level for predictions.

## Metrics Boundary

Official X docs list `public_metrics.impression_count` as an available post metric when `tweet.fields=public_metrics` is requested. They also list richer owned-post metrics under `non_public_metrics` and `organic_metrics`, which require user context and apply to posts the user owns.

The app should store metric provenance: source, sync time, field family, and whether the metric is public, non-public, organic, promoted, or inferred.

## Consumers

- `my-feedback-loop`: calibrate predictions with real post outcomes.
- `deterministic-engine`: update reach baselines, repeat-history checks, account-size scaling, and cooldown warnings.
- `llm-judge`: judge whether a draft fits recent audience behavior, profile promise, and current positioning.
- `voice-profile`: optionally refresh voice with recent posts and replies.
- Future generation features: recommend what to post next based on current performance, rotation windows, and profile graph state.

## Non-Goals

- No archive parsing.
- No browser automation or scraping.
- No external account import.
- No guarantee that all metrics are available on every plan.
- No definitive account-health diagnosis unless X exposes explicit account status fields.
- No claims that a recommendation exactly matches X ranking internals.

## UX Notes

- The user should see that API sync can cost money.
- The app should expose sync frequency, budget/cost guardrails, and cache behavior.
- The app should avoid refetching old posts unnecessarily.
- The default sync window should be bounded, likely focused on recent posts and metric retention windows.
- Missing metrics should be visible and explained without making the app feel broken.
- Predictions should distinguish measured, estimated, and inferred signals.

## Open Research Questions

- Which X API plan exposes the required post lookup, user timeline, and owned-post metric fields?
- Are `non_public_metrics` and `organic_metrics` currently available for all authenticated owned posts or only within a retention window?
- What exact OAuth scopes are required for profile, timeline, public metrics, non-public metrics, and organic metrics?
- How much does a daily sync cost for small, medium, and high-volume accounts?
- Should sync be scheduled by the app, user-triggered, or both?
- Should X Activity API be part of v1, or should v1 use pull-based daily sync only?
- How should the app handle token expiry, revoked permissions, rate limits, exhausted credits, and partial field failures?
