---
status: todo
---

# EFL-003: Wire external pattern guidance into generation

## Implementation Details

Wire sanitized external pattern guidance into the existing generation guidance path.

Extend `createGenerationGuidanceResolver` with an optional `externalPatternGuidanceProvider`. The resolver reads playbook guidance, own voice samples, and external pattern guidance without changing `GenerationGuidanceRequest` or `generateIdeaRequestSchema`.

Render order:

1. requested format playbook;
2. external performance patterns;
3. own voice samples;
4. existing founder-story guardrail when applicable.

Update writer instruction wording so a guidance block no longer implies all guidance is the author's own voice.

## Construction Contract

Add `ExternalPatternSnapshotReader` as the read-only consumer of persisted `ExternalXSignalPattern` snapshots.

Producer: `ExternalXSignalsService`.

Persisted source: `ExternalXSignalsRepository`.

Consumer: `ExternalPatternGuidanceProvider`.

`ExternalPatternSnapshotReader` must be constructed from the same `ExternalXSignalsRepository` instance used by `ExternalXSignalsService` in the host. It must not open its own SQLite database, create its own unrelated `SqliteExternalXSignalsRepository`, call transport, or read raw X payloads.

`ExternalPatternGuidanceProvider` receives only `ExternalPatternSnapshotReader` and returns sanitized generation guidance for `createGenerationGuidanceResolver`.

Default wiring:

- `buildServer` constructs `ExternalXSignalsService`, `ExternalPatternSnapshotReader`, and `ExternalPatternGuidanceProvider` from the same host `externalXSignalsRepository`.
- `createBoundEngineServices` accepts a paired `externalPatternGuidanceProvider` or `externalPatternSnapshotReader`.
- If `createBoundEngineServices` default-constructs `ExternalXSignalsService`, it creates one `ExternalXSignalsRepository` variable and shares it between the service and reader.
- If `createBoundEngineServices` receives an injected `ExternalXSignalsService` without a paired reader/provider, it does not create a separate unrelated reader; external generation guidance is disabled for that construction.

## Data Models

No public schema changes.

`GenerationGuidanceRequest` remains unchanged:

```ts
type GenerationGuidanceRequest = {
  idea?: string;
  format?: DetectedPostFormat;
  voiceProfileId?: string;
  useKnownPostIds?: string[];
};
```

`CreateGenerationGuidanceResolverInput` gains an optional engine-private provider:

```ts
type CreateGenerationGuidanceResolverInput = {
  settingsRepository: SettingsRepository;
  postLibraryRepository: PostLibraryRepository;
  externalPatternGuidanceProvider?: ExternalPatternGuidanceProvider;
};
```

## Integration Point

User entry point: existing Generate rail calls `generateIdeas({ format })`.

Upstream caller: `GenerateIdeasService.generateFromFormat`.

Existing module consumer: `createGenerationGuidanceResolver`.

Terminal outcome: generated candidates keep the existing response shape, while writer instructions include sanitized external pattern constraints when eligible persisted patterns exist.

## Scope Boundaries / Out of Scope

In scope: resolver input, external provider wiring, default server/runner construction, writer instruction wording, and tests around generation prompt behavior.

Out of scope: no `generateIdeaRequestSchema` field, no new `EngineTransport` method, no overlay UI, no Fastify endpoint, no judge/apply direct external context, no feedback/category/cooldown changes.

Zero-trace: do not add client-supplied external prompt fields, settings toggles, transport aliases, or raw evidence prompt paths.

## Test Strategy & Fixture Ownership

Coverage level: engine unit and service tests plus construction tests. Owning suites: generation guidance resolver tests, generate ideas service tests, server construction tests, runner bound-services tests. Fixture strategy: fake provider for resolver tests; seeded SQLite/repository fakes for construction tests; prompt-capturing fake structured LLM for generate service tests. Dependency category: in-process and local-substitutable SQLite only. Isolation boundary: temp DB or fakes, no developer-local config, no browser, no live X, no network.

## Definition of Done

- `createGenerationGuidanceResolver` can include sanitized external pattern guidance.
- Format generation calls the external provider when present.
- Idea-only generation does not call the external provider.
- Provider failure omits the external section and generation continues.
- Default server/runner construction shares the external repository between `ExternalXSignalsService` and the reader/provider, or disables external generation guidance when only an unpaired service is injected.
- Public generate request/response schemas and transport method count stay unchanged.

## Acceptance Criteria

- Given a format generate request and eligible external patterns / When writer instructions are built / Then the external section appears after playbook guidance and before own voice samples.
- Given an idea-only request / When generation runs / Then the external pattern provider is not called.
- Given the external provider throws / When generation runs / Then candidates still generate without external guidance.
- Given `createBoundEngineServices` receives an injected external service without a paired reader/provider / When generation is constructed / Then it does not create a separate unrelated external reader.
- Given server default storage creates an external signals repository / When generation is constructed / Then `ExternalXSignalsService` and external pattern guidance share that repository instance.

## Edge Cases

- No playbook guidance: external patterns may still render before voice samples.
- No voice corpus: external patterns render without creating a voice section.
- Founder-story guardrail ordering remains unchanged after all guidance sections.
- Provider timeout/throw never blocks generation.

## Pipeline Log

- 2026-06-29: Ticket authored from approved arch recon. Validator construction-contract fix included.
