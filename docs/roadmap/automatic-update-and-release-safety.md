# Automatic Update And Release Safety Direction

This document captures a future administrator-controlled automatic-update capability for DevHolm.

It is roadmap direction only. It does not authorize implementation work during active Issue #99 Gallery conversion, and it is separate from the visible-version realignment and release-lineage work.

## Status

- Planning-only direction
- Not implementation authorization
- Separate from Issue #99 and other active #92-#104 plugin-convergence work
- Separate from the visible-version realignment direction, while depending on the same release-lineage doctrine

## Purpose

DevHolm should eventually support safe administrator-controlled automatic update detection and, where explicitly allowed, automatic deployment.

The design goal is not "auto-install the latest SemVer-compatible release." The goal is to make update decisions from authoritative signed release metadata, deterministic preflight checks, durable execution state, and explicit rollback or recovery rules.

SemVer alone must never authorize an automatic deployment. A patch release may still require manual intervention, while a major release may be automatically deployable if the authoritative release metadata and all safety gates say it is safe.

## Non-goals For This Roadmap Entry

This roadmap entry does not implement:

- cron jobs, timers, or scheduler workers
- updater UI
- automatic deployment
- release manifest schema or signing pipeline
- backup execution
- rollback execution
- visible-version realignment
- GitHub release publication
- Issue #99 Gallery implementation changes

## Administrator Update Preferences

The future updater should allow an administrator to choose a clear automatic-update policy such as:

- automatic updates disabled
- patch releases only
- patch and minor releases
- all eligible releases, including majors
- a more explicit custom policy only if later justified by real operator needs

The user interface may use radio controls, checkboxes, or a policy selector, but the stored policy must be unambiguous.

Selecting a release category only grants permission to consider a release automatically. It does not bypass safety gates, release-manifest restrictions, compatibility requirements, or manual-approval requirements.

## Scheduled Update Detection

The scheduling layer should invoke one canonical updater operation rather than duplicate update logic.

Supported scheduler patterns should eventually include:

- an application-managed scheduled worker
- a host cron job
- a systemd timer
- another deployment-platform scheduler
- a manually triggered check

The updater should support configurable:

- check frequency
- maintenance window
- timezone
- retry and backoff policy
- notification behavior
- download-only versus install behavior where appropriate

Containerized, VPS, managed-hosting, and future orchestration environments may require different scheduler adapters.

## Release Discovery And Signed Metadata

Automatic update decisions must use authoritative release metadata rather than SemVer alone.

DevHolm should define a signed release or update manifest carrying fields such as:

- product version
- release epoch
- release sequence
- release channel
- artifact or image identity
- artifact digest
- signature and provenance
- minimum supported source version
- maximum supported direct-upgrade source version where applicable
- required intermediate version
- compatibility requirements
- database migration classification
- plugin compatibility requirements
- configuration compatibility
- infrastructure requirements
- backup requirements
- estimated downtime
- rollback availability
- release notes
- breaking-change indicators
- automatic-update eligibility
- manual-approval requirement
- automatic-update block reason
- minimum updater version

Visible product version and monotonic release lineage remain separate concepts. Release ordering must use the established epoch and sequence lineage rather than naive SemVer comparison across a version realignment boundary.

## Automatic Deployment Safety Authority

Each release must carry an authoritative safety decision that can override the administrator's broad automatic-update preference.

The model may use fields such as:

- `autoUpdateEligible: true | false`
- `requiresManualApproval: true | false`
- `automaticDeploymentPolicy: allowed | blocked | conditional`
- structured block reason codes

A release must not deploy automatically when any authoritative gate blocks it.

Potential blocking conditions include:

- breaking configuration changes
- unsupported customizations
- destructive or irreversible database migration
- missing verified backup
- unavailable rollback target
- incompatible installed plugin
- unsupported plugin API transition
- required host or infrastructure change
- required secret or environment change
- changed storage layout
- changed networking or proxy requirements
- insufficient disk, memory, or runtime version
- missing migration bridge
- source version outside the supported direct-upgrade range
- failed preflight
- unresolved recovery state
- unknown or invalid release signature
- missing artifact digest
- administrator-defined freeze or maintenance blackout

SemVer classification must never override these gates.

## Version Threshold And Compatibility Blocks

The future system should support blocking automatic deployment at or beyond a release boundary without relying on naive string comparison.

Examples include:

- blocking automatic deployment for every release at or above a specified release lineage
- requiring manual approval when upgrading from versions below a defined migration threshold
- requiring an intermediate bridge release
- blocking based on release epoch and sequence rather than visible product version alone
- blocking only when an installation-specific incompatible condition is detected

The model must account for:

- release epochs
- release sequences
- SemVer within an epoch
- upgrade source version
- upgrade target version
- direct-upgrade compatibility ranges
- required bridge versions

## Supported Methodology Warning

The updater UI and documentation must clearly warn administrators that reliable automatic updates depend on remaining within supported DevHolm development and deployment methodologies.

Supported customization paths should include appropriate mechanisms such as:

- canonical plugins
- documented extension APIs
- supported configuration files
- approved themes and templates
- migration contracts
- supported storage adapters
- deployment override files explicitly designated as customer-owned
- documented environment variables
- allowlisted framework-sync exceptions

Potentially unsupported changes include:

- editing framework-owned source files directly
- replacing updater or lifecycle internals
- modifying database schema outside supported migrations
- patching generated registries manually
- changing container entrypoint or deployment internals outside supported overrides
- modifying protected manifests or release metadata
- bypassing plugin trust, lifecycle, migration, or rollback contracts

This warning must not merely blame users. Where practical, the updater should detect drift and explain:

- what changed
- why automatic update is blocked
- whether the installation can be reconciled
- what backup or remediation is required
- whether a manual update remains possible

## Update Preflight

Before download or deployment, the updater should run a deterministic preflight stage.

Preflight should evaluate:

- current release lineage
- target release lineage
- release signature and digest
- supported upgrade path
- application or framework drift
- plugin compatibility
- plugin migration state
- database migration compatibility
- storage health
- available disk space
- backup readiness
- rollback readiness
- deployment environment
- required secrets and configuration
- active lifecycle or recovery operations
- maintenance-window eligibility
- administrator policy

Preflight should produce structured outcomes such as:

- eligible for automatic update
- eligible only for manual approval
- blocked with remediation
- bridge release required
- recovery required

## Update Execution State Machine

The update lifecycle should be durable and aligned with DevHolm lifecycle and recovery principles.

Potential phases include:

- update detected
- metadata verified
- policy evaluated
- preflight running
- awaiting maintenance window
- awaiting approval
- backup pending
- backup completed
- artifact downloading
- artifact verified
- deployment pending
- deploying
- migrations running
- health verification
- completed
- rollback pending
- rolling back
- recovery required
- manually blocked

The operation must be:

- durable
- idempotent
- resumable
- observable
- auditable
- lease-aware
- restart-safe

Automatic updating must not be designed as a single cron shell command that blindly pulls code and restarts containers.

## Backup, Deployment, Health Verification, And Rollback

The roadmap requires:

1. pre-update backup or snapshot policy
2. artifact or image digest verification
3. deployment through the canonical deployment mechanism
4. database migration checkpointing
5. plugin lifecycle compatibility checks
6. post-deployment health verification
7. exact deployed-version and build proof
8. rollback evaluation
9. automatic rollback only when explicitly safe
10. recovery-required behavior when rollback is unsafe or incomplete

Backups need a verification policy, not merely a command that claims success.

Rollback must account for:

- application image
- product release lineage
- plugin versions
- database migrations
- irreversible migrations
- storage format changes
- configuration compatibility
- last known safe deployment

## Notifications And Administrator Visibility

The future system should notify administrators when:

- an update is detected
- an update is scheduled
- an update is blocked
- manual approval is required
- backup fails
- deployment starts
- deployment succeeds
- deployment fails
- rollback starts
- rollback completes
- recovery is required

Plugin Management or a future System Update surface should show:

- current version and release lineage
- latest available version
- selected automatic-update policy
- next scheduled check
- maintenance window
- preflight result
- block reasons
- required remediation
- release notes
- migration risk
- backup state
- rollback availability
- current update operation
- history and audit events

## Security Requirements

The future design should include:

- signed manifests
- trusted release source
- digest verification
- replay protection
- monotonic release-sequence enforcement
- downgrade protection unless explicitly approved
- least-privilege scheduler and updater execution
- secret redaction
- SSRF-safe release retrieval
- rate limiting and backoff
- audit logging
- fail-closed behavior for unknown metadata
- no arbitrary release-script execution without a constrained contract

## Deployment Model Portability

The capability should work across supported deployment models, including:

- Docker Compose
- single-server or VPS installations
- managed DevHolm deployments
- future orchestration platforms
- development and testing environments

The design should separate:

- release policy
- updater orchestration
- scheduler adapter
- deployment adapter
- backup adapter
- health-check adapter
- notification adapter

Update policy must not become permanently coupled to GitHub Actions or one VPS layout.

## Safe Defaults

Proposed defaults:

- automatic updating disabled by default
- update checks enabled or easily enabled
- notification-only mode available
- no automatic major update unless explicitly selected
- no automatic update with unknown compatibility
- no automatic update without verified artifact metadata
- no automatic update when backup or rollback conditions fail
- no automatic update when unsupported drift is detected
- no automatic update while lifecycle or recovery operations are unresolved

## Relationship To Other Roadmap Directions

This direction complements but does not replace:

- plugin package versioning, pinning, and safe updates
- release-lineage and visible-version realignment
- admin-triggered update orchestration
- deployment, rollback, and recovery hardening

The signed release metadata is the final automatic-deployment authority. Administrator policy, SemVer category, and scheduling preferences only control what may be considered. They do not independently authorize deployment.
