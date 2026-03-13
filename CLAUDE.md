# CLAUDE.md

## Project Overview

`@bk.cc/workers-telemetry-client` is a standalone package that provides a lightweight, zero-dependency TypeScript client for the [Cloudflare Workers Observability Telemetry API](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/).

## Tech Stack

- **Language:** TypeScript 5.9 (strict mode, ES2022 target, `bundler` module resolution)
- **Build:** tsup (ESM only)
- **Runtime:** Node 18+ / Cloudflare Workers / any environment with native `fetch`
- **Dependencies:** Zero runtime dependencies

## Architecture

```
src/
├── client.ts        — createClient() factory returning ObservabilityClient
├── query-builder.ts — Fluent QueryBuilder with buildQuery() factory, parseDuration()
├── parse.ts         — parseEvent, parseEvents, dedup utilities
├── errors.ts        — ObservabilityError class with code discriminator, classifyError()
├── types.ts         — All TypeScript types (pure types, no runtime code)
├── index.ts         — Barrel export
└── __tests__/       — Vitest specs (*.spec.ts)
```

### Key Design Decisions

- Zero dependencies — uses native `fetch`
- Factory function pattern (`createClient()`) — no `this` binding issues, tree-shakeable
- Single error class (`ObservabilityError`) with `code` field (`auth`, `validation`, `rate_limit`, `server`, `unknown`)
- Fluent query builder: `buildQuery().service("x").last("1h").search("error").build()`
- `parseEvent()` flattens deeply nested `TelemetryEvent` into a flat `WorkerLogEntry`
- `dedup()` deduplicates log entries by request ID
- Async generator pagination (`queryPaginated`) adjusts timeframe between pages

## Commits

This project enforces **conventional commits** via commitlint + husky. All commit messages must follow this format:

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

- `feat` → minor version bump, `fix` → patch bump, `BREAKING CHANGE:` footer → major bump
- Scope is optional but encouraged (e.g., `client`, `query-builder`, `parse`, `errors`)
- Always use this format when generating commit messages with `/commit`

## Commands

```bash
npm run build       # Build with tsup
npm run typecheck   # Type check with tsc --noEmit
npm test            # Run tests (vitest)
npm run test:watch  # Watch mode tests
npm run dev         # Watch mode build
npm run release     # Trigger semantic-release (CI only)
```
