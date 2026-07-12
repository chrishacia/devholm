# ADR-0003: Marketplace runtime installation architecture and decision gates

- Status: proposed
- Date: 2026-07-11
- Related issues: #49, #7, #6
- Related PRs: #50, #51, #52, #53, #54, #55

## Context

Issue #49 established a roadmap goal to move stock plugins toward a marketplace-style model while preserving bundled fallback safety.

Completed #49 phases and evidence:

- Phase 1: package contract validation in DevHolm
- Phase 2: install-source descriptor validation in DevHolm
- Phase 3: docs/static scaffold in devholm-plugins
- Phase 4A: static fixture validation in DevHolm
- Phase 4B: manifest-shape fixture validation in DevHolm
- Phase 4C: static to manifest parity validation in DevHolm
- Phase 4D: fixture to descriptor consistency validation in DevHolm (PR #55, merge commit eccf80210cdc5d17b60f000f66be1dae48a4e715)

Current repository facts:

- devholm-plugins explicitly declares static/docs-only scaffold state and runtimeInstallSupported: false.
- DevHolm marketplace contract and descriptor layers are currently validation-only and local.
- DevHolm plugin lifecycle exists for bundled plugins, with install/enable/disable/uninstall/purge flows and migration execution from generated packaged migrations.
- DevHolm has plugin lockfile and update history primitives for versioning and rollback metadata.
- DevHolm does not currently implement runtime marketplace artifact fetch and install behavior from devholm-plugins.

Problem statement:

Issue #49 now requires a product and architecture decision package before runtime implementation can proceed safely. The remaining work is no longer fixture-shape hardening; it is host, artifact, trust, lifecycle, migration, rollback, and operational policy.

## Decision

Adopt a staged marketplace architecture with strict separation between catalog metadata and install artifacts, immutable references, and explicit trust gates.

### Recommended target architecture

1. Marketplace host model:

- Catalog metadata: static catalog documents in devholm-plugins (human and machine readable).
- Install artifacts: immutable release artifacts (tar.gz) published per plugin version.
- Runtime access: HTTPS artifact fetch via pluggable source interface in DevHolm, with local cache and no GitHub credentials required in production.

2. Source of truth:

- Plugin package source metadata for stock and first-party plugins remains declared in DevHolm install-source descriptors.
- Catalog index in devholm-plugins is authoritative for discovery metadata only.
- Artifact integrity and immutable references are authoritative for installation.

3. Artifact model:

- Installable unit is a deterministic tar.gz package.
- No direct install from repository subdirectory in production.
- Descriptor points to immutable artifact URL plus immutable ref metadata.

4. Version and ref policy:

- Require semantic plugin version.
- Require immutable reference for production installs (release artifact digest and immutable tag or commit).
- Prohibit mutable branch refs in production install policy.
- Mutable refs may exist only in explicit development mode.

5. Integrity and trust policy (staged):

- Stage A: required SHA-256 artifact checksum verification.
- Stage B: optional publisher signature verification scaffolding.
- Stage C: allowlist policy for trusted first-party publishers.
- Stage D: configurable policy for third-party and private plugins.

6. Installation pipeline policy:

- Install must run as explicit staged state machine with durable checkpoints.
- Validate and plan first, execute second.
- Default policy: no automatic lifecycle hook execution without explicit policy gate.
- Default policy: no automatic destructive migration execution.

7. Bundled fallback transition:

- Keep bundled stock plugins authoritative initially.
- Marketplace packages begin as optional update sources for first-party plugins.
- Only after repeated successful validation cycles may marketplace source become primary for selected plugins.
- Bundled fallback remains recovery path until explicit later approval.

8. Self-hosting posture:

- Runtime install path must support self-hosted artifact mirrors and local cache.
- Architecture must not require GitHub API tokens in production.
- Host abstraction must avoid single-vendor lock-in.

## Consequences

Positive:

- Converts #49 blocker into implementation-ready phases with explicit policy gates.
- Preserves current safety boundary: no forced runtime source shift, no fallback removal.
- Supports future first-party, third-party, and private plugin models.
- Aligns with existing lockfile and safe activation primitives already in DevHolm.

Costs:

- Requires incremental contract and installer pipeline work before runtime activation.
- Requires explicit product approvals for trust and lifecycle behavior.
- Adds operational requirements for artifact publication and retention.

## Alternatives considered

### Option A: Install directly from GitHub repository subdirectory

Pros:

- Minimal publishing workflow to start.

Cons:

- Mutable ref risk and weaker immutability.
- Increased network and rate-limit fragility.
- Harder deterministic rollback and cache strategy.
- Stronger coupling to GitHub availability and repository shape.

Decision: rejected for production runtime model.

### Option B: Catalog and artifacts both in DevHolm application repository

Pros:

- Fewer moving repositories.

Cons:

- Weak separation between app release cadence and plugin package cadence.
- Conflates framework runtime ownership with distribution ownership.

Decision: rejected as long-term model.

### Option C: Dedicated registry API service now

Pros:

- Strong control surface and richer policy options.

Cons:

- High immediate operational complexity and overreach for current maturity.

Decision: deferred; can be introduced after static catalog plus immutable artifact stages.

### Option D: Static catalog in devholm-plugins plus immutable release artifacts (recommended)

Pros:

- Smallest operational step that preserves deterministic install behavior.
- Works with self-hosting and cache mirrors.
- Minimizes immediate runtime and trust complexity while enabling forward evolution.

Cons:

- Requires artifact publication discipline and schema contracts.

Decision: accepted as recommended direction for implementation planning.

## Follow-up

### Installation pipeline model (desired sequence)

1. Discover plugin entry from catalog or explicit descriptor input.
2. Select version using immutable reference policy.
3. Fetch descriptor metadata.
4. Fetch artifact.
5. Verify artifact checksum and identity policy.
6. Extract to staging directory using safe extraction guards.
7. Validate package contract and path constraints.
8. Validate manifest and declared capabilities.
9. Produce install plan and risk summary.
10. Require administrator approval if policy requires.
11. Create backup and rollback checkpoint.
12. Install staged files into runtime location.
13. Register plugin package version lock.
14. Execute migrations only per explicit policy.
15. Execute lifecycle hooks only per explicit policy.
16. Enable plugin if requested.
17. Run post-install health checks.
18. Commit success or rollback fully.

### Threat model and required mitigations

Threats to address:

- path traversal and zip-slip during extraction
- archive bombs and disk exhaustion
- symlink and hardlink escape attacks
- mutable tag replacement and ref hijack
- TOCTOU between metadata and artifact fetch
- compromised publisher and poisoned artifacts
- malicious lifecycle hooks and migration abuse
- dependency confusion and plugin ID collisions
- privilege escalation and unauthorized installation
- plugin access to secrets or host filesystem beyond policy
- partial install/interruption leading to corrupt runtime

Required mitigation categories:

- immutable reference policy and checksum verification
- staged extraction into isolated directory with strict path normalization
- file type and symlink policy enforcement
- installation transaction checkpoints and rollback metadata
- scoped runtime permissions and capability review gate
- audit logging for all install, update, rollback events
- explicit admin authorization checks on install APIs

### Proposed roadmap

Phase 5A: Marketplace catalog and artifact reference contract

- Objective: formalize schema for discovery metadata and immutable artifact reference fields.
- Repository: devholm.com and devholm-plugins.
- Behavior changed: no runtime behavior change.
- Tests: schema validation tests and fixture parity tests.
- Security boundary: contract-only, no execution.
- Non-goals: no fetch, no install, no lifecycle execution.
- Approval required: no (architecture-hardening only).

Phase 5B: Installer planning state machine (dry-run only)

- Objective: implement install-plan generation pipeline with staged checkpoints and risk report.
- Repository: devholm.com.
- Behavior changed: new dry-run planner APIs only.
- Tests: planner unit tests, failure-path tests, policy tests.
- Security boundary: planning only, no artifact extraction execution.
- Non-goals: no production install execution.
- Approval required: yes before moving to execution phases.

Phase 5C: Staging and extraction safety layer

- Objective: add safe archive acquisition and extraction subsystem with path and size protections.
- Repository: devholm.com.
- Behavior changed: internal staging pipeline available behind non-runtime gate.
- Tests: traversal, symlink, archive-bomb, checksum mismatch, interruption tests.
- Security boundary: extraction safety enforcement.
- Non-goals: no lifecycle/migration execution.
- Approval required: yes.

Phase 5D: First-party runtime install execution (gated)

- Objective: execute end-to-end install for first-party plugins with explicit admin approval and rollback.
- Repository: devholm.com.
- Behavior changed: runtime install pathway for approved first-party artifact source.
- Tests: integration, rollback, startup reconciliation, audit-log tests.
- Security boundary: first-party trust gate and immutable refs required.
- Non-goals: no third-party open marketplace support.
- Approval required: yes.

Phase 5E: Trust model expansion and policy controls

- Objective: introduce publisher trust policies, allowlists, optional signatures, and private source profiles.
- Repository: devholm.com (and policy docs in devholm-plugins as needed).
- Behavior changed: policy-driven trust enforcement for broader plugin classes.
- Tests: policy matrix tests and authorization boundary tests.
- Security boundary: publisher trust and policy enforcement.
- Non-goals: no payments, no ratings, no marketplace commerce.
- Approval required: yes.

Phase 5F: Multi-process install locking hardening (issue #72)

- Objective: prevent concurrent install/update corruption by introducing per-plugin lease ownership, stale-lease recovery, and owner-only release semantics.
- Repository: devholm.com.
- Behavior changed: runtime install promotion is serialized per plugin across concurrent processes that share the same install root.
- Tests: lock collision tests, owner-only release tests, stale lease recovery tests, child-process contention tests.
- Security boundary: fail-safe on lock ambiguity; one process cannot legitimately release another process's lock.
- Non-goals: cross-host distributed consensus, external lock services, trust model changes.
- Approval required: yes.

Deployment assumptions and limits for Phase 5F

- Locking scope is per plugin and per shared install root (the `.install-locks` directory under `generated/plugins/marketplace-first-party`).
- Safe coordination requires all installer processes to resolve the same shared filesystem path for the install root.
- The lease protocol is designed for one host with multiple Node.js processes or containers mounting the same filesystem.
- Cross-host coordination is not guaranteed when hosts do not share a filesystem view.
- On lease ownership mismatch or malformed lock paths, installers fail closed rather than forcing lock deletion.

Phase 5G: Capability sandbox boundary enforcement (issue #67)

- Objective: enforce deny-by-default capability checks at actual plugin execution seams and prevent undeclared capability execution.
- Repository: devholm.com.
- Behavior changed:
  - Plugin API execution now requires explicit access-policy metadata + manifest permission alignment.
  - Plugin public-route execution now requires explicit access-policy metadata + manifest permission alignment.
  - Plugin admin-page dynamic loading now requires explicit access-policy metadata + manifest permission alignment.
  - Unknown capabilities and permission mismatches are denied and audited.
- Tests: capability policy unit tests, API resolution tests, public-route resolution tests, plugin metadata alignment tests.
- Security boundary: capability execution authorization gate at runtime dispatch seams with explicit deny and audit metadata.
- Non-goals:
  - no claim of operating-system isolation,
  - no claim of multi-host sandboxing,
  - no lifecycle-hook or migration execution sandboxing (those remain non-goals in this phase).
- Approval required: yes.

Runtime enforcement scope for Phase 5G

- Enforced now:
  - execution authorization for plugin-owned API extensions,
  - execution authorization for plugin-owned public-route extensions,
  - dynamic admin-page loading authorization for plugin-owned admin extensions,
  - deny-by-default behavior when access-policy metadata is missing.
- Not enforced yet:
  - hard process-level containment of arbitrary plugin JavaScript,
  - host-level filesystem/process/network isolation beyond dispatch authorization,
  - lifecycle-hook and migration execution containment for future runtime execution phases.

Residual risk and ordering implications

- Publisher trust (issue #69 scope) is authenticity/provenance, not runtime containment.
- Capability declarations are now authorization-gated at dispatch seams, but this is not equivalent to full process isolation.
- Next coherent step is issue #68 (lifecycle-hook execution gating/containment) before broadening publisher trust scope.

Phase 6: Optional registry service evaluation

- Objective: assess dedicated registry API only after Phase 5A-5G evidence.
- Repository: separate proposal.
- Behavior changed: none until approved.
- Tests: N/A in this phase.
- Security boundary: proposal only.
- Non-goals: no implementation in issue #49 scope.
- Approval required: yes.

### Explicit unresolved decisions requiring Chris

1. Marketplace host decision for production artifacts:

- GitHub Releases only, mirrored object storage, or self-hosted artifact endpoint.

2. Artifact format and extraction policy finalization:

- tar.gz baseline confirmed or alternative package format.

3. Immutable reference policy strictness:

- whether commit SHA is mandatory, and tag handling rules.

4. Trust policy baseline:

- checksum-only at first runtime phase versus checksum plus signature for first-party.

5. Lifecycle and migration execution default policy:

- install-time execution allowed by default, approval-gated, or split by first-party/third-party.

6. Bundled fallback transition trigger:

- evidence threshold and criteria before any plugin can switch primary source.

7. Offline and cache retention policy:

- retention period, disk limits, and cache invalidation ownership.

8. API and admin UX scope for first runtime-enabled phase:

- planner-only endpoints first or install endpoint in same phase.
