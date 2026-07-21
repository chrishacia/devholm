# Issue 103 Startup Reconciliation Modes

This document defines startup reconciliation behavior for Phase A migration/reconciliation work.

## Modes

### Mutation readiness mode

- API: `ensurePluginStartupReadyForMutation()`
- Use before ordinary lifecycle mutations (`install`, `enable`, `disable`, and other mutating flows).
- Behavior:
  - Runs startup initialization/scan if needed.
  - Fails closed when unresolved blockers exist:
    - `require-recovery`
    - `manual-intervention-required`
    - `schedule-rollback`
  - Raises `LIFECYCLE_RECOVERY_REQUIRED` for safe operator remediation.

### Recovery execution mode

- API: `initializePluginStartupReconciliation()`
- Use before recovery scan/reconcile endpoints.
- Behavior:
  - Ensures startup inspection has run.
  - Does **not** reject solely because recovery is required.
  - Allows recovery runners to classify and execute safe recovery actions.

## Cache and refresh semantics

- Concurrent callers share one in-flight initialization promise.
- Successful snapshots are cached with bounded freshness (`STARTUP_RECONCILIATION_MAX_AGE_MS`).
- Unexpected initialization failures are retryable (failure does not poison process cache forever).
- Recovery scan/reconcile marks startup state dirty to force re-evaluation for subsequent mutation readiness checks.

## Durable cutover reconciliation state

- Recovery scan now persists per-plugin cutover state and audit events using durable tables:
  - `devholm_plugin_cutover_reconciliation_states`
  - `devholm_plugin_cutover_reconciliation_events`
- State includes deterministic phase progression and blocker classification.
- Every pass writes auditable evidence tied to plugin ID and operation/correlation IDs.
- Phase mapping currently covers:
  - inspected
  - safe-migration-planned
  - migration-running
  - canonical-record-established
  - lifecycle-state-reconciled
  - canonical-ownership-activated
  - rollback-pending
  - recovery-required
  - manual-intervention-required

## Legacy topology reconciliation

- Recovery scan executes topology reconciliation for each first-party plugin:
  - legacy-only
  - canonical-only
  - legacy-and-canonical
  - neither
- Legacy-only path creates canonical lifecycle record preserving enabled/disabled intent.
- Dual-state disagreement fails closed with manual intervention required.
- Repeat-run execution is idempotent and preserves plugin-domain data rows.

## Test-only reset

- API: `resetCanonicalPluginStartupReconciliationForTests()`
- Guarded to test runtimes only (`VITEST` context checks).
- Throws if called outside test environment.

## Restart/serverless behavior

- Process-local cache applies only to the current process lifetime.
- Restart naturally resets cache state.
- In serverless/ephemeral workers, short-lived process boundaries keep cache windows small and re-evaluation frequent.

## Non-goal in this phase

- No legacy-path deletion in startup reconciliation mode changes.
- No implicit destructive rollback execution from startup mode checks.
