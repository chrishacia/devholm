# Canonical Plugin Contracts (Issues #93 and #94)

Parent tracker: #92  
Implementation issue: #93

## Scope

This document defines the canonical contract layer introduced in #93 and the resolver boundary convergence in #94:

- architecture vocabulary
- canonical configuration schema
- package and source contracts
- environment override policy
- dependency policy contract
- frontend and server contribution boundaries
- state model axes and summary projection
- configuration and secret declaration contract
- resolver output and deterministic registry authority

This issue is additive and non-destructive.

## Canonical Configuration Contract

Primary type: `CanonicalPluginConfigEntry` in `src/core/types/plugin-canonical-contracts.ts`.

Required model elements:

- schemaVersion
- pluginId
- desiredVersion
- publisher identity
- source policy
- includedInBuild
- enabledByDefault
- bundledDefault
- compatibility requirements
- update policy
- rollback policy
- dependency policy
- canonical source descriptor

Optional model elements:

- configuration references
- local source override contract
- channel and scope metadata
- frontend/server contribution declarations
- config declarations (build/runtime, secret/public, redaction)

## Source and Package Contract

Canonical source descriptor categories:

- marketplace-artifact
- mirror-artifact
- cache-artifact
- bundled-fallback-artifact
- local-development-checkout

Artifact sources require immutable identity and package metadata including:

- immutableRef and immutableRefType
- artifact locator
- sha256 digest
- publisher identity
- compatibility contract
- package format
- package version
- manifest identity

Local development source contract requires:

- filesystem path
- expected plugin id
- optional expected version
- development-only classification
- production ineligibility

## Environment and Local Override Policy

- local source overrides are development-only
- CI and production reject local filesystem overrides
- production requires immutable artifact identity
- production requires digest metadata
- production mutability is disallowed by source policy
- development local override does not bypass manifest, capability, lifecycle, migration, or identity checks

No separate development plugin list is introduced. Overrides attach to existing canonical plugin entries.

## Dependency Policy Contract

Dependency policy model supports:

- self-contained mode
- controlled build resolution mode
- unsupported runtime install mode
- lock metadata requirement
- lifecycle script prohibition in production
- size limits
- vulnerability policy references
- license metadata requirement
- SBOM reference
- native dependency restrictions

Production validation rejects unsupported runtime installation modes and unsafe script policies.

## Frontend and Server Boundaries

Frontend contribution contract includes:

- manifest UI declarations
- precompiled browser bundle metadata
- unsupported deep framework injection marker
- admin/navigation/settings/public UI declarations
- CSP and integrity metadata

Server contribution contract includes:

- isolated entry-point declarations
- API extension declarations
- public route handler declarations
- lifecycle hooks, migrations, events, jobs, and scheduled task declarations
- runtime and secret reference requirements

## State Vocabulary

Canonical state uses multi-axis representation instead of a single installed field:

- desired
- resolution
- build
- deployment
- runtime
- trust
- health
- recovery

Deterministic summary projection is provided by `summarizeCanonicalPluginState`.

## Validation Model

Validation entry point:

- `validateCanonicalPluginContracts(document, environment)`

State-axis validation entry point:

- `validateCanonicalStateAxes(axes)`

Current validation coverage includes:

- schema version support
- duplicate IDs
- plugin ID format
- version and compatibility range checks
- source metadata requirements
- local override ID and environment rules
- production mutability/digest/signature policy checks
- dependency policy safety checks
- frontend unsupported injection checks
- secret/public configuration declaration conflicts
- contradictory build/default intent checks
- impossible state-axis combinations

## Resolver and Deterministic Registry Boundary (#94)

Canonical resolver implementation:

- `resolveCanonicalPlugins(input)`
- `buildDeterministicCanonicalRegistry(input)`
- `verifyDeterministicCanonicalRegistry(snapshot)`

Resolver and deterministic registry generation details are documented in:

- `docs/plugin-canonical-resolver-and-registry.md`

Issue #94 establishes:

- one canonical resolver authority over #93 contract inputs
- deterministic resolver projection used for generated registry content
- digest-backed tamper detection for generated registry content

Issue #94 explicitly does not perform runtime/build/lifecycle cutover.

## Backward Compatibility and Transition

- Existing lifecycle and registry behavior remains unchanged.
- `toCanonicalPluginConfigEntry` provides transitional mapping from bundled plugin manifests.
- `bundledPlugins` remains transitional and is not removed in #93.
- No persisted database field meaning is silently redefined.

## Explicit Non-Goals in #93

- runtime cutover
- package conversion for Calendar/Gallery/URL Shortener
- Plugin Management redesign
- removal of bundledPlugins
- dynamic runtime Next.js source injection

## Follow-up Dependencies

- #95: development source resolution, local override workflow, and watch behavior
- #96: production build integration for resolved plugin packages
- #97: lifecycle/deployment/rollback/recovery orchestration convergence
- #103: final transitional bundled-path reconciliation and removal
