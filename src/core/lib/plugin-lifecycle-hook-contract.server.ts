import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { checksumManifest } from '@core/db/plugin-lifecycle';
import {
  evaluatePluginSandboxAccess,
  type PluginSandboxAccessDecision,
} from '@core/lib/plugin-capability-sandbox.server';
import {
  runIsolatedLifecycleHook,
  type PluginIsolationExecutionMeta,
} from '@core/lib/plugin-isolation-runtime.server';
import type { DevholmPluginManifest, PluginLifecycleContext } from '@core/types/plugins';

export type LifecycleHookName =
  | 'afterInstall'
  | 'afterUpgrade'
  | 'beforeDisable'
  | 'beforeUninstall'
  | 'purge';

export type LifecycleHookExecutionState =
  | 'pending'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'blocked'
  | 'rollback_pending'
  | 'rollback_succeeded'
  | 'rollback_failed';

interface PersistedHookExecutionRecord {
  contractVersion: 'lifecycle-hook-v1';
  operationId: string;
  hookExecutionId: string;
  pluginId: string;
  hookName: LifecycleHookName;
  artifactIdentity: string;
  state: LifecycleHookExecutionState;
  createdAt: string;
  updatedAt: string;
  context: {
    fromVersion?: string;
    toVersion?: string;
    initiatedBy?: string;
    dryRun?: boolean;
  };
  capabilities: {
    effective: string[];
    approvedBrokerOperations: string[];
  };
  sandboxDecision?: {
    allowed: boolean;
    reason: string;
    capability?: string;
    permissionKeys: string[];
    deniedPermissionKeys: string[];
    requiresExplicitApproval: boolean;
  };
  worker?: PluginIsolationExecutionMeta;
  detail?: string;
}

function hookKey(pluginId: string, operationId: string, hookName: LifecycleHookName): string {
  return `plugin:${pluginId}:lifecycle-hook:${operationId}:${hookName}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toTrackedContext(
  context: PluginLifecycleContext
): PersistedHookExecutionRecord['context'] {
  return {
    fromVersion: context.fromVersion,
    toVersion: context.toVersion,
    initiatedBy: context.initiatedBy,
    dryRun: context.dryRun,
  };
}

function buildArtifactIdentity(manifest: DevholmPluginManifest): string {
  return `bundled:${manifest.id}@${manifest.version}:${checksumManifest(manifest)}`;
}

function resolveLifecycleCapability(manifest: DevholmPluginManifest): {
  capability: string;
  permissionKeys: string[];
} {
  const authorization = manifest.lifecycleAuthorization;
  if (!authorization) {
    throw new Error(
      `Lifecycle hook execution blocked: ${manifest.id} is missing explicit lifecycleAuthorization`
    );
  }

  const declaredPermissions = manifest.permissions ?? [];
  const resolvedPermissionKeys = authorization.permissionKeys.map((permissionKey) => {
    const permission = declaredPermissions.find((entry) => entry.key === permissionKey);
    if (!permission) {
      throw new Error(
        `Lifecycle hook execution blocked: ${manifest.id} lifecycleAuthorization references undeclared permission ${permissionKey}`
      );
    }

    if (permission.capability !== authorization.capability) {
      throw new Error(
        `Lifecycle hook execution blocked: ${manifest.id} lifecycleAuthorization permission ${permissionKey} does not match capability ${authorization.capability}`
      );
    }

    if (permission.scope !== 'admin') {
      throw new Error(
        `Lifecycle hook execution blocked: ${manifest.id} lifecycleAuthorization permission ${permissionKey} is not admin-scoped`
      );
    }

    return permission.key;
  });

  if (resolvedPermissionKeys.length === 0) {
    throw new Error(
      `Lifecycle hook execution blocked: ${manifest.id} lifecycleAuthorization.permissionKeys is empty`
    );
  }

  return {
    capability: authorization.capability,
    permissionKeys: resolvedPermissionKeys,
  };
}

async function readRecord(
  pluginId: string,
  operationId: string,
  hookName: LifecycleHookName
): Promise<PersistedHookExecutionRecord | null> {
  const db = getDb();
  const row = await db('site_settings')
    .where({ key: hookKey(pluginId, operationId, hookName) })
    .first();
  if (!row?.value) {
    return null;
  }

  try {
    return JSON.parse(String(row.value)) as PersistedHookExecutionRecord;
  } catch {
    return null;
  }
}

async function writeRecord(record: PersistedHookExecutionRecord): Promise<void> {
  const db = getDb();
  const key = hookKey(record.pluginId, record.operationId, record.hookName);
  const now = new Date();
  await db('site_settings')
    .insert({
      key,
      value: JSON.stringify(record),
      type: 'json',
      category: 'plugins',
      description: `Lifecycle hook execution state for ${record.pluginId}:${record.hookName}`,
      updated_at: now,
    })
    .onConflict('key')
    .merge({
      value: JSON.stringify(record),
      updated_at: now,
    });
}

function applySandboxSnapshot(
  decision: PluginSandboxAccessDecision
): PersistedHookExecutionRecord['sandboxDecision'] {
  return {
    allowed: decision.allowed,
    reason: decision.reason,
    capability: decision.capability,
    permissionKeys: decision.permissionKeys,
    deniedPermissionKeys: decision.deniedPermissionKeys,
    requiresExplicitApproval: decision.requiresExplicitApproval,
  };
}

export async function executeLifecycleHookWithIsolation(params: {
  manifest: DevholmPluginManifest;
  hookName: LifecycleHookName;
  context: PluginLifecycleContext;
  operationId: string;
  allowReplay?: boolean;
}): Promise<{
  operationId: string;
  hookExecutionId: string;
  state: LifecycleHookExecutionState;
  detail?: string;
}> {
  const hook = params.manifest.lifecycle?.[params.hookName];
  if (!hook) {
    return {
      operationId: params.operationId,
      hookExecutionId: randomUUID(),
      state: 'blocked',
      detail: `Lifecycle hook ${params.hookName} is not declared`,
    };
  }

  const existing = await readRecord(params.manifest.id, params.operationId, params.hookName);
  if (existing && existing.state === 'succeeded') {
    if (params.allowReplay) {
      return {
        operationId: existing.operationId,
        hookExecutionId: existing.hookExecutionId,
        state: existing.state,
        detail: 'existing successful lifecycle hook execution record reused',
      };
    }

    return {
      operationId: existing.operationId,
      hookExecutionId: existing.hookExecutionId,
      state: 'blocked',
      detail: 'duplicate lifecycle hook dispatch blocked by durable execution record',
    };
  }

  const hookExecutionId = randomUUID();
  const baseRecord: PersistedHookExecutionRecord = {
    contractVersion: 'lifecycle-hook-v1',
    operationId: params.operationId,
    hookExecutionId,
    pluginId: params.manifest.id,
    hookName: params.hookName,
    artifactIdentity: buildArtifactIdentity(params.manifest),
    state: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    context: toTrackedContext(params.context),
    capabilities: {
      effective: [],
      approvedBrokerOperations: ['lifecycle-hook-execute'],
    },
  };

  let capability: string;
  let permissionKeys: string[];

  try {
    const resolvedAuthorization = resolveLifecycleCapability(params.manifest);
    capability = resolvedAuthorization.capability;
    permissionKeys = resolvedAuthorization.permissionKeys;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const blockedRecord: PersistedHookExecutionRecord = {
      ...baseRecord,
      state: 'blocked',
      updatedAt: nowIso(),
      detail: message,
    };
    await writeRecord(blockedRecord);
    return {
      operationId: params.operationId,
      hookExecutionId,
      state: 'blocked',
      detail: message,
    };
  }

  const sandboxDecision = await evaluatePluginSandboxAccess({
    pluginId: params.manifest.id,
    surface: 'lifecycle-hook',
    resourceId: `lifecycle:${params.hookName}`,
    accessPolicy: {
      scope: 'admin',
      capability,
      permissionKeys,
      runtimeOwner: 'plugin-extension',
      notes: 'issue-68 lifecycle hook runtime gate',
    },
  });

  const pendingRecord: PersistedHookExecutionRecord = {
    ...baseRecord,
    capabilities: {
      effective: [capability],
      approvedBrokerOperations: ['lifecycle-hook-execute'],
    },
    sandboxDecision: applySandboxSnapshot(sandboxDecision),
  };
  await writeRecord(pendingRecord);

  if (!sandboxDecision.allowed) {
    const blockedRecord: PersistedHookExecutionRecord = {
      ...pendingRecord,
      state: 'blocked',
      updatedAt: nowIso(),
      detail: sandboxDecision.reason,
    };
    await writeRecord(blockedRecord);
    return {
      operationId: params.operationId,
      hookExecutionId,
      state: 'blocked',
      detail: sandboxDecision.reason,
    };
  }

  await writeRecord({
    ...pendingRecord,
    state: 'approved',
    updatedAt: nowIso(),
  });

  await writeRecord({
    ...pendingRecord,
    state: 'running',
    updatedAt: nowIso(),
  });

  try {
    const isolated = await runIsolatedLifecycleHook({
      pluginId: params.manifest.id,
      hookName: params.hookName,
      operationId: params.operationId,
      hookExecutionId,
      artifactIdentity: baseRecord.artifactIdentity,
      context: params.context,
      effectiveCapabilities: [capability],
      approvedBrokerOperations: ['lifecycle-hook-execute'],
    });

    const state: LifecycleHookExecutionState =
      isolated.status === 'succeeded'
        ? 'succeeded'
        : isolated.status === 'timed_out'
          ? 'timed_out'
          : isolated.status === 'cancelled'
            ? 'cancelled'
            : isolated.status === 'blocked'
              ? 'blocked'
              : 'failed';

    await writeRecord({
      ...baseRecord,
      state,
      updatedAt: nowIso(),
      worker: isolated.meta,
      detail: isolated.message,
    });

    return {
      operationId: params.operationId,
      hookExecutionId,
      state,
      detail: isolated.message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedState: LifecycleHookExecutionState = /timed out/i.test(message)
      ? 'timed_out'
      : 'failed';

    await writeRecord({
      ...pendingRecord,
      state: normalizedState,
      updatedAt: nowIso(),
      detail: message,
    });

    return {
      operationId: params.operationId,
      hookExecutionId,
      state: normalizedState,
      detail: message,
    };
  }
}
