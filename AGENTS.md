# AGENTS.md

## Project Profile

> Maintained by the arch-recon skill (single writer, append-only). Facts only — no architectural opinions. Other pipeline skills read this section; precedence: observed repo reality → ticket/Architecture Context → these facts → generic conventions.

### Repo Map

- `client/` — `@x-builder/client`: Vite + React UI (app shell, writer studio, status bar, settings, judge panel)
- `engine/` — `@x-builder/engine`: Fastify API (health, status/readiness, settings, generation, post analysis, judge)
- `shared/` — `@x-builder/shared`: Zod schemas shared between client and engine
- `e2e-tests/` — `@x-builder/e2e-tests`: end-to-end suites (excluded from `pnpm test`, run via `pnpm test:e2e`)
- `tools/` — internal tooling notes (README only)
- `docs/features/<slug>/` — per-feature docs: `map/`, `spec/`, `architecture/`, `tickets/`

### Stack & Commands

- Node.js 20+, pnpm 9.15.0 (Corepack), Turbo 2, TypeScript 5.7, Vitest 3, Zod, Fastify (engine), Vite + React (client)
- Build: `pnpm build` · Dev (engine + client): `pnpm dev` · Unit/integration tests: `pnpm test` · E2E: `pnpm test:e2e` · Typecheck: `pnpm typecheck` · Lint: `pnpm lint`
- Engine settings persist locally under `~/.x-builder/engine-settings`

### Ticket Source

- `local: docs/features/` — no Linear on this project. Tickets live at `docs/features/<slug>/tickets/<ID>-<slug>.md` with a `tickets/README.md` build-order index.

### Docs Target

- `docs/` — plain markdown, no docs site generator.

### Pattern References

- none registered

### Reference Repos

- none registered (this repo itself serves as the reference for pipeline runs)
