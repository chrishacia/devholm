# ADR-0002: SDK boundary entrypoints and declarative authorization policy

- Status: proposed
- Date: 2026-07-03
- Related issues: #6, #12
- Related PRs: TBD

## Context

DevHolm currently has useful extension and auth primitives, but downstream contracts are not yet centralized under versioned SDK entrypoints. Downstream code can import selected internal `@core/lib/*` modules directly, and authorization enforcement is not yet described by a single declarative model that applies consistently across pages, APIs, server actions, navigation, admin pages, public routes, and UI actions.

Issue #6 requires stable, upgrade-safe SDK boundaries and a shared access-policy model while preserving clear framework-owned and site-owned responsibilities.

## Decision

Propose a four-entrypoint SDK boundary model:

1. `@devholm/sdk` for shared runtime-neutral contracts and registration helper definitions
2. `@devholm/sdk/server` for authoritative server-side policy evaluation and enforcement adapters
3. `@devholm/sdk/client` for visibility-only client helpers
4. `@devholm/sdk/testing` for downstream contract and upgrade-safety tests

Propose a declarative access-policy model with composable policy shapes:

- everyone
- anonymous-only
- authenticated
- roles
- permissions
- ownership
- custom async callback
- allOf / anyOf composition

Policy decisions must support consistent unauthenticated/forbidden/not-found outcomes and fail-closed behavior.

Client evaluation remains advisory for presentation. Server evaluation remains authoritative for all privileged operations.

## Consequences

### Positive

- Clear separation between supported SDK imports and internal framework modules
- Unified authorization semantics across route and UI surfaces
- Better upgrade safety for downstream developers
- Shared test tooling for contract compliance

### Costs

- Requires staged migration from existing ad-hoc route checks
- Requires compatibility adapters while existing registries are still in use
- Requires explicit documentation and contract tests to enforce boundaries

## Alternatives considered

### Keep current internal imports and document best effort guidance

Rejected because it does not create enforceable upgrade-safe contracts and cannot guarantee boundary stability.

### Move all authorization logic into middleware only

Rejected because middleware alone cannot safely and consistently enforce all server actions, API paths, and ownership checks.

### Expose raw internal modules as public API

Rejected because it freezes internal implementation details and increases long-term maintenance risk.

## Follow-up

- Use the inventory and architecture docs to drive implementation staging:
  - `docs/roadmap/sdk-authorization-contract-inventory.md`
  - `docs/roadmap/sdk-authorization-architecture.md`
- Keep this ADR in proposed state until independently reviewed.
- After review, create follow-on implementation tasks that preserve issue boundaries (#11, #7, #8, #9, #10 remain separate).
