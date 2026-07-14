# ADR-0004: Canonical plugin architecture and configuration contracts

- Status: accepted
- Date: 2026-07-14
- Parent issue: #92
- Implementation issue: #93
- Depends on: ADR-0003
- Follow-up issues: #94, #95, #96

## Context

DevHolm currently contains robust plugin lifecycle, registry, migration, marketplace planning, and trust-oriented primitives. However, key semantics are fragmented across transitional contracts and mixed terminology:

- bundled versus installed versus enabled are used in overlapping ways
- source descriptors are split between bundled and marketplace-driven types
- production safety rules for local overrides and mutability are not centralized in one contract
- state reporting uses operational fields that do not clearly separate desired, resolved, build, deploy, runtime, trust, health, and recovery axes

Issue #93 establishes a canonical model and validation contract that later phases depend on, without runtime cutover.

## Decision

Adopt one additive canonical plugin contract model for architecture, source semantics, dependency policy, contribution boundaries, configuration declarations, and state vocabulary.

### One semantic model

Development and production share canonical meaning for:

- plugin identity
- plugin configuration
- package/source contract
- compatibility declarations
- capability-aligned metadata
- settings/config declarations
- lifecycle vocabulary
- migration ownership boundaries
- state reporting vocabulary

Environment changes only source resolution eligibility and build/deploy behavior.

### Bundled meaning

Bundled means:

- present in default canonical configuration
- available locally
- included as production build input
- available as offline fallback artifact source
- marketplace-listable through normal metadata contracts
- managed by standard lifecycle semantics

Bundled does not mean:

- privileged permanent source imports bypassing package contracts
- exemption from trust, compatibility, or manifest identity metadata
- ambiguous installed/enabled equivalence

### Build semantics

- Next-integrated frontend plugin code is build-time included only
- production runtime does not inject arbitrary new Next.js source
- runtime enable or disable applies only to deployed build-included code
- dynamic execution remains restricted to supported isolated server extension seams
- build-integrated plugin installation equals desired configuration plus build/deploy

### Layered state model

Canonical state is represented by separate axes:

- desired
- resolution
- build
- deployment
- runtime
- trust
- health
- recovery

UI and API consumers must use deterministic summary projection rather than collapsing to one ambiguous installed boolean.

### Source hierarchy

Canonical source categories:

- marketplace artifact
- configured mirror artifact
- cache artifact
- bundled fallback artifact
- local development checkout

Precedence and environment restrictions are contract-defined in #93; full runtime resolver behavior is deferred.

### Transitional architecture statement

- bundledPlugins remains transitional and is not removed in #93
- synthetic marketplace records remain transitional where already present
- #93 introduces authoritative contracts and validation only
- runtime cutover and destructive migration of paths are deferred to later issues

## Consequences

Positive:

- later phases consume one typed contract and state vocabulary
- policy checks become deterministic and testable
- production safety requirements are explicit
- backward compatibility is preserved with additive adaptation

Costs:

- duplicate transitional and canonical contracts temporarily coexist
- follow-up work is still required for runtime integration and migration

## Non-goals in #93

- no runtime cutover
- no conversion of Calendar, Gallery, URL Shortener packaging paths
- no removal of bundledPlugins
- no Plugin Management redesign beyond compile-safe additive contracts
- no dynamic Next.js runtime source injection claims
