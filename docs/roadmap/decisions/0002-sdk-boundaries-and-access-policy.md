# ADR-0002: SDK boundary entrypoints and declarative authorization policy

- Status: proposed
- Date: 2026-07-03
- Related issues: #6, #12
- Related PRs: #26

## Context

DevHolm has useful extension and auth primitives, but downstream contracts are not yet centralized under versioned SDK entrypoints. Downstream code can still import internal `@core/lib/*` modules directly, and authorization behavior is inconsistent across middleware, route handlers, and extension dispatch paths.

Issue #6 requires stable, upgrade-safe SDK boundaries and a shared policy model that applies consistently across pages, APIs, server actions, navigation, admin pages, public routes, slot components, and UI actions.

## Decision

Adopt a proposed four-entrypoint boundary model:

1. `@devholm/sdk` for runtime-neutral, serializable declarations and registration metadata
2. `@devholm/sdk/server` for server-only evaluators, resolvers, and authoritative authorization adapters
3. `@devholm/sdk/client` for client-safe visibility projections only
4. `@devholm/sdk/testing` for contract, compatibility, and boundary-guard tests

Adopt an explicit-policy default for newly registered executable server surfaces:

- access declaration is required
- omitted policy is invalid for new registrations
- public behavior must be explicit (`everyone`)

Adopt fail-closed evaluation defaults:

- evaluator/resolver exceptions deny execution
- log operational diagnostics without sensitive details
- return defined server error outcomes

Adopt declaration/evaluator split:

- serializable policy declarations are runtime-neutral
- custom callbacks and ownership/resource resolvers are server-only contracts
- client bundles must never import server evaluators or raw service handles

## Consequences

### Positive

- Clear separation between supported SDK imports and internal orchestration modules
- Deterministic security defaults for new executable registrations
- Better upgrade safety through explicit contracts and testing layers
- Improved ability to enforce import boundaries across aliases and deep imports

### Compatibility and migration costs

- Existing registrations that rely on implicit behavior require a temporary legacy adapter
- Legacy adapter must emit development/build warnings and provide migration path
- Existing one-off route authorization checks will coexist during migration stages
- Administrator-resolution inconsistency (middleware `isAdmin` path vs helper behavior) must be reconciled explicitly before unified policy replacement

### Operational costs

- Additional adapter layers per surface (pages, APIs, actions, admin pages, public routes)
- New boundary enforcement configuration (export maps, lint rules, TS/module constraints, fixture tests)
- Review overhead to ratify unresolved policy defaults

## Alternatives considered

### Keep internal imports and rely on documentation guidance

Rejected because guidance alone does not create enforceable, upgrade-safe contracts.

### Put all authorization logic in middleware

Rejected because middleware cannot safely/authoritatively enforce every server action, ownership check, or mutation-time decision.

### Expose internal orchestration modules directly as public API

Rejected because it freezes implementation details and increases long-term maintenance and compatibility risk.

## Unresolved decisions (explicit)

1. Canonical administrator semantics during and after compatibility migration.
2. Surface-level defaults for forbidden vs concealed-not-found outcomes.
3. Duration and enforcement level of legacy compatibility adapters.
4. Final scoped service API detail for plugin-owned data/settings operations.

## Follow-up

- Keep this ADR proposed until independent review confirms unresolved decisions.
- Use these design artifacts for staged implementation planning:
  - `docs/roadmap/sdk-authorization-contract-inventory.md`
  - `docs/roadmap/sdk-authorization-architecture.md`
- Preserve issue boundaries: #11, #7, #8, #9, and #10 remain separate workstreams.
