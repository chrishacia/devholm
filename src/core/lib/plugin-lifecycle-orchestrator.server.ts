import { randomUUID } from 'node:crypto';
import { getPluginState } from '@core/db/plugins';
import { disablePlugin, enablePlugin, installPlugin } from '@core/lib/plugin-lifecycle.server';
import {
  readLatestPluginLifecycleOperationRecord,
  type PluginLifecycleMutationAction as DurablePluginLifecycleMutationAction,
  type PluginLifecycleOperationRecord,
  type PluginLifecycleStateSnapshot,
  type PluginLifecycleTransitionEventRecord,
  writePluginLifecycleOperationRecord,
  writePluginLifecycleTransitionEvent,
} from '@core/db/plugin-lifecycle';

export type PluginLifecycleMutationAction = Extract<
  DurablePluginLifecycleMutationAction,
  'install' | 'enable' | 'disable'
>;

export type PluginLifecycleOperationReadModel = PluginLifecycleOperationRecord;

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

async function recordLifecycleOperation(record: PluginLifecycleOperationRecord): Promise<void> {
  await writePluginLifecycleOperationRecord(record);
}

async function appendLifecycleEvent(event: PluginLifecycleTransitionEventRecord): Promise<void> {
  await writePluginLifecycleTransitionEvent(event);
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
}

export async function orchestratePluginLifecycleMutation(
  input: PluginLifecycleMutationInput
): Promise<void> {
  const operationId = randomUUID();
  const correlationId = randomUUID();
  const startedAt = new Date().toISOString();
  const priorStateSnapshot = await snapshotPluginState(input.pluginId);

  await recordLifecycleOperation({
    schemaVersion: 1,
    operationId,
    pluginId: input.pluginId,
    action: input.action,
    status: 'running',
    actor: input.initiatedBy,
    correlationId,
    currentPhase: 'executing',
    startedAt,
    updatedAt: startedAt,
    attemptCount: 1,
    priorStateSnapshot,
  });

  if (input.action === 'install') {
    try {
      await installPlugin(input.pluginId, { initiatedBy: input.initiatedBy });
      const finishedAt = new Date().toISOString();
      const nextStateSnapshot = await snapshotPluginState(input.pluginId);

      await recordLifecycleOperation({
        schemaVersion: 1,
        operationId,
        pluginId: input.pluginId,
        action: input.action,
        status: 'succeeded',
        actor: input.initiatedBy,
        correlationId,
        currentPhase: 'completed',
        startedAt,
        updatedAt: finishedAt,
        finishedAt,
        attemptCount: 1,
        priorStateSnapshot,
        nextStateSnapshot,
      });

      await appendLifecycleEvent({
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
      });
      return;
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      await recordLifecycleOperation({
        schemaVersion: 1,
        operationId,
        pluginId: input.pluginId,
        action: input.action,
        status: 'failed',
        actor: input.initiatedBy,
        correlationId,
        currentPhase: 'completed',
        startedAt,
        updatedAt: finishedAt,
        finishedAt,
        attemptCount: 1,
        priorStateSnapshot,
        error: { message },
      });
      await appendLifecycleEvent({
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
        error: { message },
      });
      throw error;
    }
  }

  if (input.action === 'enable') {
    try {
      await enablePlugin(input.pluginId, input.initiatedBy);
      const finishedAt = new Date().toISOString();
      const nextStateSnapshot = await snapshotPluginState(input.pluginId);

      await recordLifecycleOperation({
        schemaVersion: 1,
        operationId,
        pluginId: input.pluginId,
        action: input.action,
        status: 'succeeded',
        actor: input.initiatedBy,
        correlationId,
        currentPhase: 'completed',
        startedAt,
        updatedAt: finishedAt,
        finishedAt,
        attemptCount: 1,
        priorStateSnapshot,
        nextStateSnapshot,
      });
      await appendLifecycleEvent({
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
      });
      return;
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      await recordLifecycleOperation({
        schemaVersion: 1,
        operationId,
        pluginId: input.pluginId,
        action: input.action,
        status: 'failed',
        actor: input.initiatedBy,
        correlationId,
        currentPhase: 'completed',
        startedAt,
        updatedAt: finishedAt,
        finishedAt,
        attemptCount: 1,
        priorStateSnapshot,
        error: { message },
      });
      await appendLifecycleEvent({
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
        error: { message },
      });
      throw error;
    }
  }

  try {
    await disablePlugin(input.pluginId, input.initiatedBy);
    const finishedAt = new Date().toISOString();
    const nextStateSnapshot = await snapshotPluginState(input.pluginId);

    await recordLifecycleOperation({
      schemaVersion: 1,
      operationId,
      pluginId: input.pluginId,
      action: input.action,
      status: 'succeeded',
      actor: input.initiatedBy,
      correlationId,
      currentPhase: 'completed',
      startedAt,
      updatedAt: finishedAt,
      finishedAt,
      attemptCount: 1,
      priorStateSnapshot,
      nextStateSnapshot,
    });
    await appendLifecycleEvent({
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
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await recordLifecycleOperation({
      schemaVersion: 1,
      operationId,
      pluginId: input.pluginId,
      action: input.action,
      status: 'failed',
      actor: input.initiatedBy,
      correlationId,
      currentPhase: 'completed',
      startedAt,
      updatedAt: finishedAt,
      finishedAt,
      attemptCount: 1,
      priorStateSnapshot,
      error: { message },
    });
    await appendLifecycleEvent({
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
      error: { message },
    });
    throw error;
  }
}
