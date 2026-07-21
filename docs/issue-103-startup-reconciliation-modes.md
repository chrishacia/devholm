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
