# DevHolm Roadmap

This directory is the durable planning home for DevHolm.

GitHub issues carry actionable work. The documents here preserve the long-lived product direction, sequencing, architectural principles, and completion rules behind those issues.

## Source of truth

- Top-level roadmap tracker: [#12](https://github.com/chrishacia/devholm/issues/12)
- Idea inbox: [#16](https://github.com/chrishacia/devholm/issues/16)
- Roadmap governance implementation: [#13](https://github.com/chrishacia/devholm/issues/13)
- Active workstreams: [`WORKSTREAMS.md`](./WORKSTREAMS.md)
- Process and completion rules: [`GOVERNANCE.md`](./GOVERNANCE.md)
- Architectural decisions: [`decisions/`](./decisions/)
- Completed milestone summaries: [`archive/`](./archive/)
- Issue #6 design artifacts:
  - [`sdk-authorization-contract-inventory.md`](./sdk-authorization-contract-inventory.md)
  - [`sdk-authorization-architecture.md`](./sdk-authorization-architecture.md)
  - [`sdk-authorization-implementation-plan.md`](./sdk-authorization-implementation-plan.md)
  - [`sdk-stage1-package-boundaries.md`](./sdk-stage1-package-boundaries.md)
  - [`sdk-stage2-policy-engine.md`](./sdk-stage2-policy-engine.md)

## Current sequence

Completed foundation:

- Plugin lifecycle and URL Shortener skeleton ([#5](https://github.com/chrishacia/devholm/issues/5), [#4](https://github.com/chrishacia/devholm/pull/4))

Next active foundation:

- Formalize the public developer SDK and authorization contracts ([#6](https://github.com/chrishacia/devholm/issues/6))

Planned after SDK:

- Add extension events, background jobs, and scheduled-task seams ([#11](https://github.com/chrishacia/devholm/issues/11))
- Add plugin package versioning, pinning, lockfiles, and safe update planning ([#7](https://github.com/chrishacia/devholm/issues/7))
- Build the URL Shortener functional MVP as the first complete reference plugin ([#8](https://github.com/chrishacia/devholm/issues/8))
- Convert Calendar and Gallery into lifecycle-managed plugins ([#9](https://github.com/chrishacia/devholm/issues/9), [#10](https://github.com/chrishacia/devholm/issues/10))

Plugin lifecycle foundation: completed.
URL Shortener functional product: not completed.

## Later strategic directions

- Build the DevHolm plugin marketplace and distribute first-party plugins through it.
- Convert Resume, Uses, and Projects into lifecycle-managed marketplace plugins while keeping them configured as stock DevHolm capabilities by default.
- Preserve the out-of-box experience while allowing stock plugins to be disabled, removed, reinstalled, updated, pinned, rolled back, and recovered through supported lifecycle contracts.
- Add an authorized admin page for arranging the order of core and plugin-contributed admin navigation links, with stable identifiers, deterministic fallback ordering, persistence, reset, and recovery behavior.
- Build a ChatGPT and compatible agent integration plugin after plugin convergence is complete.
- Revisit and sanity-check the existing agentic-style API endpoint before using it as the integration foundation.
- Begin with least-privilege read-only capabilities, then add explicitly scoped and auditable write actions.
- Keep authentication, authorization, approval boundaries, rate limits, revocation, and capability declarations inside supported DevHolm contracts.

The detailed ideas remain in the long-lived [idea inbox](https://github.com/chrishacia/devholm/issues/16) until they are mature enough for dedicated implementation issues. See [`WORKSTREAMS.md`](./WORKSTREAMS.md) for sequencing and architectural boundaries.

## Architectural principles

- DevHolm remains a useful site and framework out of the box.
- Framework-owned code and site-owned code stay clearly separated.
- Downstream functionality uses supported public contracts rather than patching framework internals.
- The SDK should make normal React, Next.js, TypeScript, API, and service development easier—not force every feature into a narrow framework-specific shape.
- Authentication, roles, permissions, and access policies are framework services available to site-owned code and plugins.
- Client-side visibility never replaces server-side authorization.
- Plugins own their schema, settings, migrations, lifecycle, versions, dependencies, and compatibility declarations.
- Framework and plugin upgrades fail visibly and recoverably instead of silently corrupting state.
- Marketplace compatibility is designed into package/version contracts before a marketplace exists.
- New ideas are recorded and scoped before substantial implementation begins.

## Directory policy

Roadmap and planning files belong under `docs/roadmap/`. Do not add ad hoc planning documents to the repository root.

Product documentation, developer guides, changelogs, and release notes remain in their existing dedicated locations; this directory should link to them rather than duplicate them.
