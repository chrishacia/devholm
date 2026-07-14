# Plugin Terminology Glossary (Canonical)

Parent: #92  
Phase: #93

- Configured: plugin appears in canonical desired configuration.
- Resolving: source, version, and compatibility checks are in progress.
- Resolved: source and version are selected.
- Verified: source metadata and policy checks are satisfied.
- Awaiting Approval: policy requires explicit operator approval before proceeding.
- Build Pending: desired config change requires build and is queued.
- Building: build is currently executing.
- Build Included: plugin artifacts are included in build output.
- Deploy Pending: deployment not started for a build-included change.
- Deploying: deployment is running.
- Deployed: build with plugin inclusion reached target environment.
- Activating: runtime activation flow is in progress.
- Active: runtime activation is complete.
- Disabled: plugin is intentionally not active.
- Degraded: plugin is active but operating with known impairment.
- Update Available: newer allowed version is available.
- Updating: plugin update operation is in progress.
- Rollback Available: prior known-good rollback candidate exists.
- Rolling Back: rollback operation is in progress.
- Recovery Required: operator intervention is required to restore service.
- Incompatible: plugin/version/source is incompatible with platform constraints.
- Blocked: progression is prevented by policy, trust, approval, or contract failures.
- Failed: operation or state transition terminated unsuccessfully.

Related terms:

- Bundled: plugin is part of default canonical configuration and build input with offline fallback semantics.
- Installed: historical transitional term in existing ledger; not equivalent to active or deployed in canonical model.
- Enabled: intent and activation signal; canonical model separates desired, runtime, and deployment axes.
- Available: discoverable in catalog/source, not necessarily resolved or verified.
- Marketplace: metadata and artifact ecosystem, not automatic runtime installation permission.
