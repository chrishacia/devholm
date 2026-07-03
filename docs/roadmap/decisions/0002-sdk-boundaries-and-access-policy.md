# ADR-0002: SDK boundary entrypoints and declarative authorization policy

- Status: proposed
- Date: 2026-07-03
- Related issues: #6, #12
- Related PRs: #26

## Context

DevHolm currently blends normal Next.js development patterns with framework-specific extension and plugin contracts. Internal orchestration modules and runtime-specific behavior are not yet separated into stable public SDK boundaries.

Issue #6 requires upgrade-safe public contracts, explicit authorization defaults, and deterministic behavior across pages, APIs, actions, admin pages, public routes, navigation, slots, and UI actions.

## Decision

Adopt a runtime-separated contract model:

1. `@devholm/sdk` contains runtime-neutral serializable declarations and identifier types.
2. Runtime-specific executable helpers are owned by runtime-appropriate entrypoints (`@devholm/sdk/server`, `@devholm/sdk/react` or equivalent split).
3. `@devholm/sdk/testing` provides compatibility, boundary, and runtime-target fixture tests.

Adopt explicit policy defaults for new executable server registrations:

- access declaration is required
- omitted declaration is invalid
- public behavior requires explicit `everyone`

Adopt fail-closed operational behavior:

- evaluator/resolver exceptions produce `policy-error`
- default transport 500, dependency-unavailable classification 503
- no sensitive details exposed
- claimed public route failures do not fall through to lower-precedence routes

Adopt registration ownership and namespacing:

- registrations are owner-scoped (`framework`, `site`, `plugin:<id>`)
- references to permissions/evaluators/resolvers are validated against owner namespace
- duplicates, unknown references, and owner/plugin mismatches are rejected
- plugin-owned registrations require plugin installed/enabled validation

Adopt composition validation and deterministic aggregation:

- evaluators/resolvers must be side-effect-free
- empty `allOf` and `anyOf` are invalid registrations
- invalid composition fails validation and fails closed at runtime if encountered
- deterministic result classes: `allow`, `unauthenticated`, `forbidden`, `not-found`, `policy-error`

Adopt capability-scoped service construction:

- plugin evaluators receive plugin-scoped capabilities only
- no raw framework DB handle in plugin evaluator context
- no arbitrary site/framework/other-plugin settings exposure
- runtime service construction enforces capability boundaries beyond type-level checks

Adopt SDK stability baseline:

- public SDK contracts follow DevHolm SemVer initially
- breaking public SDK contract changes require major DevHolm version
- deep implementation imports are unsupported
- deprecations remain functional through documented migration window with diagnostics before removal

Adopt runtime-target separation:

- runtime compatibility matrix is documented and tested
- import safety tests detect Node-only server modules in incompatible client/middleware/edge bundles

## Consequences

### Positive

- Clear public/internal boundary with runtime ownership clarity
- Safer default authorization posture for new executable registrations
- Deterministic composition/failure semantics
- Stronger upgrade safety through explicit versioning and boundary enforcement

### Compatibility and migration costs

- legacy registrations may require temporary compatibility adapters
- compatibility adapters must warn and include migration path
- existing route-level auth checks coexist during staged migration
- current administrator-resolution mismatch (middleware `isAdmin` path vs helper behavior) must be reconciled explicitly

### Operational costs

- additional validation and registry checks at generation/build/startup
- additional per-surface adapter logic
- additional test matrix for runtime targets and boundary enforcement

## Alternatives considered

### Keep internal imports and rely on docs guidance

Rejected because guidance alone does not enforce compatibility boundaries.

### Centralize all authorization in middleware

Rejected because middleware cannot authoritatively cover all server action/API/ownership cases.

### Expose internal orchestration as public API

Rejected because it freezes implementation details and increases long-term maintenance risk.

## Unresolved decisions (explicit)

1. Canonical administrator semantics after compatibility migration (including `isAdmin` parity).
2. Default concealment behavior (`403` vs `404`) per surface/capability class.
3. Compatibility adapter duration and strictness milestones.
4. Final plugin data API shape inside capability isolation boundaries.
5. Final runtime entrypoint naming refinement (`client` vs `react` split details).

## Follow-up

- Keep ADR in proposed status pending independent review.
- Use these design artifacts for staged implementation planning:
  - `docs/roadmap/sdk-authorization-contract-inventory.md`
  - `docs/roadmap/sdk-authorization-architecture.md`
- Preserve issue boundaries: #11, #7, #8, #9, #10 remain separate workstreams.
