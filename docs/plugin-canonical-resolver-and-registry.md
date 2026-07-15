# Canonical Plugin Resolver and Deterministic Registry (Issue #94)

Parent tracker: #92  
Implementation issue: #94  
Depends on: #93

## Purpose

Issue #94 establishes one authoritative resolver boundary that consumes canonical plugin contracts and produces deterministic, verified resolver outputs for later consumers.

This issue intentionally does not perform runtime, build, or lifecycle cutover.

## Resolver Boundary

Primary implementation:

- src/core/lib/plugin-canonical-resolver.server.ts
- src/core/types/plugin-canonical-resolver.ts

Resolver entry points:

- resolveCanonicalPlugins(input)
- buildDeterministicCanonicalRegistry(input)
- verifyDeterministicCanonicalRegistry(snapshot)

Core behavior:

- validates canonical contracts from #93 before resolution
- enforces source and environment policy rules
- fails closed on invalid or ambiguous production-like inputs
- emits deterministic content separate from operational observation metadata
- emits stable failure taxonomy codes for API and admin projection

## Source Resolution and Policy Enforcement

Production-like environments (ci, production) enforce:

- local-development-checkout forbidden
- immutable references required by source policy
- digest requirements required by source policy
- mutable branch-like refs rejected when prohibited
- source/version/plugin identity mismatch blocked
- publisher identity mismatch blocked

Development allows local override only when canonical source policy explicitly permits it.

## Deterministic Registry Generation

Generation path:

- scripts/plugins-generate-registry.ts

Verification path:

- scripts/plugins-check-registry.ts

The generated registry now includes:

- schemaVersion
- generatorVersion
- contentDigestSha256
- content (deterministic resolver projection)
- plugins (migration packaging metadata retained for existing workflow compatibility)

Deterministic properties:

- stable plugin ordering
- stable property ordering via canonical serialization
- digest computed from canonical content block
- no timestamp dependency inside deterministic digest payload

## Tamper Detection

Registry verification recomputes content digest and rejects mismatch.

Failure code:

- registry-tampering

This detects edited content divergence after generation.

## Transitional Compatibility

Issue #94 is additive and transitional:

- preserves existing migration-asset packaging workflow
- preserves existing plugin install execution path behavior
- does not introduce development watch/hot reload flow (#95)
- does not integrate plugins into Next production build inclusion flow (#96)
- does not perform lifecycle/deployment orchestration cutover (#97)
- does not remove transitional bundled path (#103)

## Explicit Non-Goals for #94

- no development watcher integration
- no production Next build inclusion cutover
- no lifecycle deployment state cutover
- no first-party plugin conversion work
- no Plugin Management redesign

## Deferred Follow-up Mapping

- #95: development source resolution/watch workflow
- #96: production build integration of resolved plugin packages
- #97: lifecycle/deployment/rollback/recovery orchestration convergence
- #103: final transitional bundled-path reconciliation and removal

## Issue #95 Development Workflow

The `pnpm dev` workflow now runs through canonical plugin source resolution before the Next.js dev
server starts.

Behavior:

- runs deterministic `plugins:generate` with resolver environment `development` before dev readiness
- watches plugin source roots and coalesces rebuilds to avoid duplicate regeneration work
- keeps watchers active after generation failures so the next edit can recover automatically
- writes generated registry payloads atomically to avoid partial file reads

### Local Override Contract

Development-only local overrides are configured through:

- `DEVHOLM_PLUGIN_LOCAL_OVERRIDES`

Format:

- JSON object mapping existing configured plugin IDs to local checkout directories

Example:

- `{ "calendar": "../devholm-plugins/plugins/calendar" }`

Guardrails:

- unknown plugin IDs are rejected
- override paths must resolve to existing directories
- overrides are rejected outside development resolution (`ci` and `production`)
- override state is projected in plugin management status as source-resolution metadata
