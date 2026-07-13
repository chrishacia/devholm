import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { checksumManifest } from '@core/db/plugin-lifecycle';
import {
  evaluatePluginSandboxAccess,
  type PluginSandboxAccessDecision,
} from '@core/lib/plugin-capability-sandbox.server';
import type { DevholmPluginManifest } from '@core/types/plugins';

export type PluginMigrationDirection = 'up' | 'down';

export type PluginMigrationExecutionState =
  | 'pending'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked';

export interface MigrationExecutionLockIdentity {
  model: 'pg-advisory-v1';
  namespace: string;
  scope: string;
  ownerPid: number;
}

interface PersistedMigrationExecutionRecord {
  contractVersion: 'plugin-migration-v1';
  operationId: string;
  executionId: string;
  pluginId: string;
  pluginVersion: string;
  migrationId: string;
  direction: PluginMigrationDirection;
  checksum: string;
  artifactIdentity: string;
  state: PluginMigrationExecutionState;
  createdAt: string;
  updatedAt: string;
  capabilities: {
    effective: string[];
    approvedBrokerOperations: string[];
  };
  lockIdentity?: MigrationExecutionLockIdentity;
  sandboxDecision?: {
    allowed: boolean;
    reason: string;
    capability?: string;
    permissionKeys: string[];
    deniedPermissionKeys: string[];
    requiresExplicitApproval: boolean;
  };
  durationMs?: number;
  detail?: string;
}

function validateLockIdentity(params: {
  lockIdentity: MigrationExecutionLockIdentity;
  pluginId: string;
  operationId: string;
}): string | null {
  if (params.lockIdentity.model !== 'pg-advisory-v1') {
    return `Migration execution blocked: unsupported lock identity model ${params.lockIdentity.model}`;
  }

  const expectedScope = `plugin:${params.pluginId}:operation:${params.operationId}`;
  if (params.lockIdentity.scope !== expectedScope) {
    return `Migration execution blocked: lock identity scope mismatch (expected ${expectedScope}, received ${params.lockIdentity.scope})`;
  }

  if (!Number.isInteger(params.lockIdentity.ownerPid) || params.lockIdentity.ownerPid <= 0) {
    return 'Migration execution blocked: lock identity ownerPid must be a positive integer';
  }

  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function migrationKey(
  pluginId: string,
  migrationId: string,
  direction: PluginMigrationDirection
): string {
  return `plugin:${pluginId}:migration:${direction}:${migrationId}`;
}

function applySandboxSnapshot(
  decision: PluginSandboxAccessDecision
): PersistedMigrationExecutionRecord['sandboxDecision'] {
  return {
    allowed: decision.allowed,
    reason: decision.reason,
    capability: decision.capability,
    permissionKeys: decision.permissionKeys,
    deniedPermissionKeys: decision.deniedPermissionKeys,
    requiresExplicitApproval: decision.requiresExplicitApproval,
  };
}

function buildArtifactIdentity(manifest: DevholmPluginManifest): string {
  return `bundled:${manifest.id}@${manifest.version}:${checksumManifest(manifest)}`;
}

function resolveMigrationCapability(manifest: DevholmPluginManifest): {
  capability: string;
  permissionKeys: string[];
} {
  const authorization = manifest.migrationAuthorization ?? manifest.lifecycleAuthorization;
  if (!authorization) {
    throw new Error(
      `Migration execution blocked: ${manifest.id} is missing explicit migrationAuthorization`
    );
  }

  const declaredPermissions = manifest.permissions ?? [];
  const resolvedPermissionKeys = authorization.permissionKeys.map((permissionKey) => {
    const permission = declaredPermissions.find((entry) => entry.key === permissionKey);
    if (!permission) {
      throw new Error(
        `Migration execution blocked: ${manifest.id} migrationAuthorization references undeclared permission ${permissionKey}`
      );
    }

    if (permission.capability !== authorization.capability) {
      throw new Error(
        `Migration execution blocked: ${manifest.id} migrationAuthorization permission ${permissionKey} does not match capability ${authorization.capability}`
      );
    }

    if (permission.scope !== 'admin') {
      throw new Error(
        `Migration execution blocked: ${manifest.id} migrationAuthorization permission ${permissionKey} is not admin-scoped`
      );
    }

    return permission.key;
  });

  if (resolvedPermissionKeys.length === 0) {
    throw new Error(
      `Migration execution blocked: ${manifest.id} migrationAuthorization.permissionKeys is empty`
    );
  }

  return {
    capability: authorization.capability,
    permissionKeys: resolvedPermissionKeys,
  };
}

async function readRecord(
  pluginId: string,
  migrationId: string,
  direction: PluginMigrationDirection
): Promise<PersistedMigrationExecutionRecord | null> {
  const db = getDb();
  const row = await db('site_settings')
    .where({ key: migrationKey(pluginId, migrationId, direction) })
    .first();

  if (!row?.value) {
    return null;
  }

  try {
    return JSON.parse(String(row.value)) as PersistedMigrationExecutionRecord;
  } catch {
    return null;
  }
}

async function writeRecord(record: PersistedMigrationExecutionRecord): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db('site_settings')
    .insert({
      key: migrationKey(record.pluginId, record.migrationId, record.direction),
      value: JSON.stringify(record),
      type: 'json',
      category: 'plugins',
      description: `Migration execution state for ${record.pluginId}:${record.migrationId}`,
      updated_at: now,
    })
    .onConflict('key')
    .merge({
      value: JSON.stringify(record),
      updated_at: now,
    });
}

export async function executePluginMigrationWithGate(params: {
  manifest: DevholmPluginManifest;
  migrationId: string;
  pluginVersion: string;
  checksum: string;
  direction: PluginMigrationDirection;
  operationId: string;
  lockIdentity?: MigrationExecutionLockIdentity;
  execute: () => Promise<void>;
}): Promise<{
  executionId: string;
  state: PluginMigrationExecutionState;
  detail?: string;
}> {
  const executionId = randomUUID();
  const existing = await readRecord(params.manifest.id, params.migrationId, params.direction);

  if (existing?.state === 'succeeded' && existing.checksum === params.checksum) {
    return {
      executionId,
      state: 'blocked',
      detail: 'duplicate successful migration execution blocked by durable execution record',
    };
  }

  const baseRecord: PersistedMigrationExecutionRecord = {
    contractVersion: 'plugin-migration-v1',
    operationId: params.operationId,
    executionId,
    pluginId: params.manifest.id,
    pluginVersion: params.pluginVersion,
    migrationId: params.migrationId,
    direction: params.direction,
    checksum: params.checksum,
    artifactIdentity: buildArtifactIdentity(params.manifest),
    state: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    capabilities: {
      effective: [],
      approvedBrokerOperations: ['migration-execute'],
    },
    lockIdentity: params.lockIdentity,
  };

  if (params.lockIdentity) {
    const lockValidation = validateLockIdentity({
      lockIdentity: params.lockIdentity,
      pluginId: params.manifest.id,
      operationId: params.operationId,
    });

    if (lockValidation) {
      await writeRecord({
        ...baseRecord,
        state: 'blocked',
        updatedAt: nowIso(),
        detail: lockValidation,
      });
      return { executionId, state: 'blocked', detail: lockValidation };
    }
  }

  let capability: string;
  let permissionKeys: string[];

  try {
    const resolved = resolveMigrationCapability(params.manifest);
    capability = resolved.capability;
    permissionKeys = resolved.permissionKeys;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await writeRecord({
      ...baseRecord,
      state: 'blocked',
      updatedAt: nowIso(),
      detail,
    });
    return { executionId, state: 'blocked', detail };
  }

  const sandboxDecision = await evaluatePluginSandboxAccess({
    pluginId: params.manifest.id,
    surface: 'migration',
    resourceId: `migration:${params.direction}:${params.migrationId}`,
    accessPolicy: {
      scope: 'admin',
      capability,
      permissionKeys,
      runtimeOwner: 'plugin-extension',
      notes: 'issue-71 migration execution gate',
    },
  });

  const pendingRecord: PersistedMigrationExecutionRecord = {
    ...baseRecord,
    capabilities: {
      effective: [capability],
      approvedBrokerOperations: ['migration-execute'],
    },
    sandboxDecision: applySandboxSnapshot(sandboxDecision),
  };

  await writeRecord(pendingRecord);

  if (!sandboxDecision.allowed) {
    const detail = sandboxDecision.reason;
    await writeRecord({
      ...pendingRecord,
      state: 'blocked',
      updatedAt: nowIso(),
      detail,
    });

    return {
      executionId,
      state: 'blocked',
      detail,
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

  const startedAt = Date.now();
  try {
    await params.execute();
    const durationMs = Date.now() - startedAt;
    await writeRecord({
      ...pendingRecord,
      state: 'succeeded',
      durationMs,
      updatedAt: nowIso(),
    });
    return {
      executionId,
      state: 'succeeded',
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startedAt;
    await writeRecord({
      ...pendingRecord,
      state: 'failed',
      durationMs,
      updatedAt: nowIso(),
      detail,
    });

    return {
      executionId,
      state: 'failed',
      detail,
    };
  }
}
