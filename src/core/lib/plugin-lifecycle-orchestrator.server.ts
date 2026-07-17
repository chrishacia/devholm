import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { getPluginState } from '@core/db/plugins';
import { getPluginDefinitions } from '@core/lib/plugins';
import { disablePlugin, enablePlugin, installPlugin } from '@core/lib/plugin-lifecycle.server';
import {
  findActivePluginLifecycleOperation,
  findPluginLifecycleOperationByIdempotencyKey,
  readLatestPluginLifecycleOperationRecord,
  type PluginLifecycleMutationAction as DurablePluginLifecycleMutationAction,
  type PluginLifecycleOperationRecord,
  type PluginLifecycleStateSnapshot,
  type PluginLifecycleTransitionEventRecord,
  writePluginLifecycleOperationRecord,
  writePluginLifecycleTransitionEvent,
} from '@core/db/plugin-lifecycle';
import { mapUnknownLifecycleError, PluginLifecycleError } from '@core/lib/plugin-lifecycle-errors';

export type PluginLifecycleMutationAction = Extract<
  DurablePluginLifecycleMutationAction,
  'install' | 'enable' | 'disable'
>;

export type PluginLifecycleOperationReadModel = PluginLifecycleOperationRecord;

const OPERATION_LEASE_MS = 5 * 60 * 1000;
const MUTATION_AUTHORITY_VERSION = 'v2';

export interface PluginLifecycleAuthorizationContext {
  isAdmin?: boolean;
  principal?: string;
  roles?: readonly string[];
}

export interface PluginLifecycleMutationResult {
  operationId: string;
  status: PluginLifecycleOperationRecord['status'];
  replayed: boolean;
}

async function snapshotPluginState(pluginId: string): Promise<PluginLifecycleStateSnapshot | null> {
  const state = await getPluginState(pluginId);
  if (!state) {
    return null;
  }

  return {
    installed: state.installed,
    enabled: state.isEnabled,
    lifecycleState: state.lifecycleState,
    operationStatus: state.operationStatus,
    installedVersion: state.installedVersion,
    bundledVersion: state.bundledVersion,
    updatedAt: state.updatedAt ? state.updatedAt.toISOString() : null,
  };
}

async function recordLifecycleOperation(
  record: PluginLifecycleOperationRecord,
  db = getDb()
): Promise<void> {
  await writePluginLifecycleOperationRecord(record, db);
}

async function appendLifecycleEvent(
  event: PluginLifecycleTransitionEventRecord,
  db = getDb()
): Promise<void> {
  await writePluginLifecycleTransitionEvent(event, db);
}

export async function readLatestPluginLifecycleOperation(
  pluginId: string
): Promise<PluginLifecycleOperationReadModel | null> {
  return readLatestPluginLifecycleOperationRecord(pluginId);
}

export interface PluginLifecycleMutationInput {
  action: PluginLifecycleMutationAction;
  pluginId: string;
  initiatedBy?: string;
  idempotencyKey?: string;
  correlationId?: string;
  expectedLifecycleState?: string;
  authorizationContext?: PluginLifecycleAuthorizationContext;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string };
  return candidate.code === '23505';
}

function assertPluginExists(pluginId: string): void {
  const exists = getPluginDefinitions().some((entry) => entry.id === pluginId);
  if (!exists) {
    throw new PluginLifecycleError({
      code: 'LIFECYCLE_INVALID_TRANSITION',
      internalDiagnostic: `Unknown plugin: ${pluginId}`,
      publicMessageOverride: `Unknown plugin: ${pluginId}`,
    });
  }
}

function assertAuthorization(input: PluginLifecycleMutationInput): void {
  if (input.authorizationContext?.isAdmin === false) {
    throw new PluginLifecycleError({
      code: 'LIFECYCLE_UNAUTHORIZED',
      internalDiagnostic: `authorization denied for ${input.action}:${input.pluginId}`,
    });
  }
}

function assertTransitionAllowed(
  input: PluginLifecycleMutationInput,
  currentState: Awaited<ReturnType<typeof getPluginState>>
): void {
  if (input.action === 'install') {
    return;
  }

  if (!currentState?.installed) {
    throw new PluginLifecycleError({
      code: 'LIFECYCLE_INVALID_TRANSITION',
      internalDiagnostic: `Cannot ${input.action} ${input.pluginId}: plugin is not installed`,
      publicMessageOverride: `Cannot ${input.action} ${input.pluginId}: plugin is not installed`,
    });
  }

  if (input.action === 'enable' && currentState.isEnabled) {
    return;
  }

  if (input.action === 'disable' && !currentState.isEnabled) {
    return;
  }
}

function isLeaseExpired(leaseExpiresAt?: string): boolean {
  if (!leaseExpiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(leaseExpiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= Date.now();
}

export async function orchestratePluginLifecycleMutation(
  input: PluginLifecycleMutationInput
): Promise<PluginLifecycleMutationResult> {
  assertPluginExists(input.pluginId);
  assertAuthorization(input);

  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  const operationId = randomUUID();
  const correlationId = input.correlationId?.trim() || randomUUID();
  const startedAt = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + OPERATION_LEASE_MS).toISOString();
  const priorStateSnapshot = await snapshotPluginState(input.pluginId);

  const currentState = await getPluginState(input.pluginId);
  assertTransitionAllowed(input, currentState);

  const db = getDb();

  if (
    input.expectedLifecycleState &&
    currentState?.lifecycleState !== input.expectedLifecycleState
  ) {
    throw new PluginLifecycleError({
      code: 'LIFECYCLE_STALE_OPERATION',
      internalDiagnostic: `expected lifecycle state ${input.expectedLifecycleState}, got ${currentState?.lifecycleState ?? 'none'}`,
    });
  }

  if (idempotencyKey) {
    const previousOperation = await findPluginLifecycleOperationByIdempotencyKey(
      input.pluginId,
      idempotencyKey,
      db
    );

    if (previousOperation) {
      if (previousOperation.status === 'succeeded') {
        return {
          operationId: previousOperation.operationId,
          status: previousOperation.status,
          replayed: true,
        };
      }

      if (previousOperation.status === 'requested' || previousOperation.status === 'running') {
        throw new PluginLifecycleError({
          code: 'LIFECYCLE_OPERATION_CONFLICT',
          internalDiagnostic: `idempotency key ${idempotencyKey} is already active for ${input.pluginId}`,
        });
      }

      throw new PluginLifecycleError({
        code: 'LIFECYCLE_STALE_OPERATION',
        internalDiagnostic: `idempotency key ${idempotencyKey} already resolved with status ${previousOperation.status}`,
      });
    }
  }

  const activeOperation = await findActivePluginLifecycleOperation(input.pluginId, db);
  if (activeOperation) {
    if (isLeaseExpired(activeOperation.leaseExpiresAt)) {
      const reconciledAt = new Date().toISOString();
      await db.transaction(async (trx) => {
        await recordLifecycleOperation(
          {
            ...activeOperation,
            status: 'interrupted',
            currentPhase: 'completed',
            updatedAt: reconciledAt,
            finishedAt: reconciledAt,
            error: {
              code: 'LIFECYCLE_STALE_OPERATION',
              message: 'Lifecycle lease expired before operation completion.',
              retryable: true,
              recoveryClassification: 'reconcile-on-restart',
            },
          },
          trx
        );

        await appendLifecycleEvent(
          {
            schemaVersion: 1,
            eventId: randomUUID(),
            operationId: activeOperation.operationId,
            pluginId: activeOperation.pluginId,
            transition: activeOperation.action,
            result: 'failed',
            actor: activeOperation.actor,
            correlationId: activeOperation.correlationId,
            timestamp: reconciledAt,
            previousState: activeOperation.priorStateSnapshot,
            nextState: activeOperation.priorStateSnapshot,
            error: {
              code: 'LIFECYCLE_STALE_OPERATION',
              message: 'Lifecycle lease expired before operation completion.',
              retryable: true,
              recoveryClassification: 'reconcile-on-restart',
            },
          },
          trx
        );
      });
    } else {
      throw new PluginLifecycleError({
        code: 'LIFECYCLE_OPERATION_CONFLICT',
        internalDiagnostic: `active lifecycle operation ${activeOperation.operationId} prevents ${input.action}:${input.pluginId}`,
      });
    }
  }

  const activeOperationAfterReconciliation = await findActivePluginLifecycleOperation(input.pluginId, db);
  if (activeOperationAfterReconciliation) {
    throw new PluginLifecycleError({
      code: 'LIFECYCLE_OPERATION_CONFLICT',
      internalDiagnostic: `active lifecycle operation ${activeOperationAfterReconciliation.operationId} prevents ${input.action}:${input.pluginId}`,
    });
  }

  try {
    await db.transaction(async (trx) => {
      await writePluginLifecycleOperationRecord(
        {
          schemaVersion: 1,
          operationId,
          pluginId: input.pluginId,
          action: input.action,
          idempotencyKey,
          status: 'running',
          actor: input.initiatedBy,
          leaseOwner: process.env.HOSTNAME || 'devholm-local',
          leaseExpiresAt,
          expectedLifecycleState: input.expectedLifecycleState,
          authorizationContext: input.authorizationContext as Record<string, unknown> | undefined,
          mutationAuthorityVersion: MUTATION_AUTHORITY_VERSION,
          correlationId,
          currentPhase: 'executing',
          startedAt,
          updatedAt: startedAt,
          attemptCount: 1,
          priorStateSnapshot,
        },
        trx
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PluginLifecycleError({
        code: 'LIFECYCLE_OPERATION_CONFLICT',
        internalDiagnostic: `unique conflict creating lifecycle operation for ${input.pluginId}`,
      });
    }

    throw new PluginLifecycleError({
      code: 'LIFECYCLE_INFRASTRUCTURE_UNAVAILABLE',
      internalDiagnostic: error instanceof Error ? error.message : String(error),
    });
  }

  if (input.action === 'install') {
    try {
      await installPlugin(input.pluginId, { initiatedBy: input.initiatedBy });
      const finishedAt = new Date().toISOString();
      const nextStateSnapshot = await snapshotPluginState(input.pluginId);

      await db.transaction(async (trx) => {
        await recordLifecycleOperation(
          {
            schemaVersion: 1,
            operationId,
            pluginId: input.pluginId,
            action: input.action,
            idempotencyKey,
            status: 'succeeded',
            actor: input.initiatedBy,
            leaseOwner: process.env.HOSTNAME || 'devholm-local',
            leaseExpiresAt,
            expectedLifecycleState: input.expectedLifecycleState,
            authorizationContext: input.authorizationContext as Record<string, unknown> | undefined,
            mutationAuthorityVersion: MUTATION_AUTHORITY_VERSION,
            correlationId,
            currentPhase: 'completed',
            startedAt,
            updatedAt: finishedAt,
            finishedAt,
            attemptCount: 1,
            priorStateSnapshot,
            nextStateSnapshot,
          },
          trx
        );

        await appendLifecycleEvent(
          {
            schemaVersion: 1,
            eventId: randomUUID(),
            operationId,
            pluginId: input.pluginId,
            transition: input.action,
            result: 'succeeded',
            actor: input.initiatedBy,
            correlationId,
            timestamp: finishedAt,
            previousState: priorStateSnapshot,
            nextState: nextStateSnapshot,
          },
          trx
        );
      });

      return {
        operationId,
        status: 'succeeded',
        replayed: false,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const mappedError = mapUnknownLifecycleError(error);
      await db.transaction(async (trx) => {
        await recordLifecycleOperation(
          {
            schemaVersion: 1,
            operationId,
            pluginId: input.pluginId,
            action: input.action,
            idempotencyKey,
            status: 'failed',
            actor: input.initiatedBy,
            leaseOwner: process.env.HOSTNAME || 'devholm-local',
            leaseExpiresAt,
            expectedLifecycleState: input.expectedLifecycleState,
            authorizationContext: input.authorizationContext as Record<string, unknown> | undefined,
            mutationAuthorityVersion: MUTATION_AUTHORITY_VERSION,
            correlationId,
            currentPhase: 'completed',
            startedAt,
            updatedAt: finishedAt,
            finishedAt,
            attemptCount: 1,
            priorStateSnapshot,
            error: {
              code: mappedError.code,
              message: mappedError.publicMessage,
              retryable: mappedError.retryable,
              recoveryClassification: mappedError.recoveryClassification,
            },
          },
          trx
        );
        await appendLifecycleEvent(
          {
            schemaVersion: 1,
            eventId: randomUUID(),
            operationId,
            pluginId: input.pluginId,
            transition: input.action,
            result: 'failed',
            actor: input.initiatedBy,
            correlationId,
            timestamp: finishedAt,
            previousState: priorStateSnapshot,
            nextState: priorStateSnapshot,
            error: {
              code: mappedError.code,
              message: mappedError.publicMessage,
              retryable: mappedError.retryable,
              recoveryClassification: mappedError.recoveryClassification,
            },
          },
          trx
        );
      });
      throw mappedError;
    }
  }

  if (input.action === 'enable') {
    try {
      await enablePlugin(input.pluginId, input.initiatedBy);
      const finishedAt = new Date().toISOString();
      const nextStateSnapshot = await snapshotPluginState(input.pluginId);

      await db.transaction(async (trx) => {
        await recordLifecycleOperation(
          {
            schemaVersion: 1,
            operationId,
            pluginId: input.pluginId,
            action: input.action,
            idempotencyKey,
            status: 'succeeded',
            actor: input.initiatedBy,
            leaseOwner: process.env.HOSTNAME || 'devholm-local',
            leaseExpiresAt,
            expectedLifecycleState: input.expectedLifecycleState,
            authorizationContext: input.authorizationContext as Record<string, unknown> | undefined,
            mutationAuthorityVersion: MUTATION_AUTHORITY_VERSION,
            correlationId,
            currentPhase: 'completed',
            startedAt,
            updatedAt: finishedAt,
            finishedAt,
            attemptCount: 1,
            priorStateSnapshot,
            nextStateSnapshot,
          },
          trx
        );
        await appendLifecycleEvent(
          {
            schemaVersion: 1,
            eventId: randomUUID(),
            operationId,
            pluginId: input.pluginId,
            transition: input.action,
            result: 'succeeded',
            actor: input.initiatedBy,
            correlationId,
            timestamp: finishedAt,
            previousState: priorStateSnapshot,
            nextState: nextStateSnapshot,
          },
          trx
        );
      });

      return {
        operationId,
        status: 'succeeded',
        replayed: false,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const mappedError = mapUnknownLifecycleError(error);
      await db.transaction(async (trx) => {
        await recordLifecycleOperation(
          {
            schemaVersion: 1,
            operationId,
            pluginId: input.pluginId,
            action: input.action,
            idempotencyKey,
            status: 'failed',
            actor: input.initiatedBy,
            leaseOwner: process.env.HOSTNAME || 'devholm-local',
            leaseExpiresAt,
            expectedLifecycleState: input.expectedLifecycleState,
            authorizationContext: input.authorizationContext as Record<string, unknown> | undefined,
            mutationAuthorityVersion: MUTATION_AUTHORITY_VERSION,
            correlationId,
            currentPhase: 'completed',
            startedAt,
            updatedAt: finishedAt,
            finishedAt,
            attemptCount: 1,
            priorStateSnapshot,
            error: {
              code: mappedError.code,
              message: mappedError.publicMessage,
              retryable: mappedError.retryable,
              recoveryClassification: mappedError.recoveryClassification,
            },
          },
          trx
        );
        await appendLifecycleEvent(
          {
            schemaVersion: 1,
            eventId: randomUUID(),
            operationId,
            pluginId: input.pluginId,
            transition: input.action,
            result: 'failed',
            actor: input.initiatedBy,
            correlationId,
            timestamp: finishedAt,
            previousState: priorStateSnapshot,
            nextState: priorStateSnapshot,
            error: {
              code: mappedError.code,
              message: mappedError.publicMessage,
              retryable: mappedError.retryable,
              recoveryClassification: mappedError.recoveryClassification,
            },
          },
          trx
        );
      });
      throw mappedError;
    }
  }

  try {
    await disablePlugin(input.pluginId, input.initiatedBy);
    const finishedAt = new Date().toISOString();
    const nextStateSnapshot = await snapshotPluginState(input.pluginId);

    await db.transaction(async (trx) => {
      await recordLifecycleOperation(
        {
          schemaVersion: 1,
          operationId,
          pluginId: input.pluginId,
          action: input.action,
          idempotencyKey,
          status: 'succeeded',
          actor: input.initiatedBy,
          leaseOwner: process.env.HOSTNAME || 'devholm-local',
          leaseExpiresAt,
          expectedLifecycleState: input.expectedLifecycleState,
          authorizationContext: input.authorizationContext as Record<string, unknown> | undefined,
          mutationAuthorityVersion: MUTATION_AUTHORITY_VERSION,
          correlationId,
          currentPhase: 'completed',
          startedAt,
          updatedAt: finishedAt,
          finishedAt,
          attemptCount: 1,
          priorStateSnapshot,
          nextStateSnapshot,
        },
        trx
      );
      await appendLifecycleEvent(
        {
          schemaVersion: 1,
          eventId: randomUUID(),
          operationId,
          pluginId: input.pluginId,
          transition: input.action,
          result: 'succeeded',
          actor: input.initiatedBy,
          correlationId,
          timestamp: finishedAt,
          previousState: priorStateSnapshot,
          nextState: nextStateSnapshot,
        },
        trx
      );
    });

    return {
      operationId,
      status: 'succeeded',
      replayed: false,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const mappedError = mapUnknownLifecycleError(error);
    await db.transaction(async (trx) => {
      await recordLifecycleOperation(
        {
          schemaVersion: 1,
          operationId,
          pluginId: input.pluginId,
          action: input.action,
          idempotencyKey,
          status: 'failed',
          actor: input.initiatedBy,
          leaseOwner: process.env.HOSTNAME || 'devholm-local',
          leaseExpiresAt,
          expectedLifecycleState: input.expectedLifecycleState,
          authorizationContext: input.authorizationContext as Record<string, unknown> | undefined,
          mutationAuthorityVersion: MUTATION_AUTHORITY_VERSION,
          correlationId,
          currentPhase: 'completed',
          startedAt,
          updatedAt: finishedAt,
          finishedAt,
          attemptCount: 1,
          priorStateSnapshot,
          error: {
            code: mappedError.code,
            message: mappedError.publicMessage,
            retryable: mappedError.retryable,
            recoveryClassification: mappedError.recoveryClassification,
          },
        },
        trx
      );
      await appendLifecycleEvent(
        {
          schemaVersion: 1,
          eventId: randomUUID(),
          operationId,
          pluginId: input.pluginId,
          transition: input.action,
          result: 'failed',
          actor: input.initiatedBy,
          correlationId,
          timestamp: finishedAt,
          previousState: priorStateSnapshot,
          nextState: priorStateSnapshot,
          error: {
            code: mappedError.code,
            message: mappedError.publicMessage,
            retryable: mappedError.retryable,
            recoveryClassification: mappedError.recoveryClassification,
          },
        },
        trx
      );
    });
    throw mappedError;
  }
}
