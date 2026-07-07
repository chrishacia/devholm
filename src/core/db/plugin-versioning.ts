import { getDb } from '@/db';
import { createHash } from 'crypto';
import type {
  PluginLockfile,
  PluginPackageLock,
  PluginUpdatePin,
  PluginUpdatePolicy,
  PluginUpdateRecord,
  PluginPackageSource,
  PluginPackageIntegrity,
} from '@core/types/plugins';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sha256Hex(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/**
 * Get the locked version of a specific plugin
 */
export async function getPluginLock(pluginId: string): Promise<PluginPackageLock | null> {
  const db = getDb();
  const row = await db('plugin_lockfile').where({ plugin_id: pluginId }).first();

  if (!row) {
    return null;
  }

  return {
    pluginId: row.plugin_id,
    version: row.version,
    devholmVersion: row.devholm_version,
    source: JSON.parse(row.package_source),
    integrity: {
      packageChecksum: row.package_checksum,
      manifestChecksum: row.manifest_checksum,
      migrationChecksums: JSON.parse(row.migration_checksums),
    },
    lockedAt: row.locked_at.toISOString(),
    lockedBy: row.locked_by,
  };
}

/**
 * Get all plugin locks (entire lockfile)
 */
export async function getAllPluginLocks(): Promise<PluginLockfile> {
  const db = getDb();
  const rows = await db('plugin_lockfile')
    .orderBy('updated_at', 'desc')
    .orderBy('plugin_id', 'asc');
  const packages: Record<string, PluginPackageLock> = {};

  const devholmVersion = rows[0]?.devholm_version || '';
  let latestUpdatedAt = new Date(0).toISOString();

  for (const row of rows) {
    const lock: PluginPackageLock = {
      pluginId: row.plugin_id,
      version: row.version,
      devholmVersion: row.devholm_version,
      source: JSON.parse(row.package_source),
      integrity: {
        packageChecksum: row.package_checksum,
        manifestChecksum: row.manifest_checksum,
        migrationChecksums: JSON.parse(row.migration_checksums),
      },
      lockedAt: row.locked_at.toISOString(),
      lockedBy: row.locked_by,
    };

    packages[row.plugin_id] = lock;
    if (row.updated_at.toISOString() > latestUpdatedAt) {
      latestUpdatedAt = row.updated_at.toISOString();
    }
  }

  const lockfileChecksum = sha256Hex({
    lockfileVersion: 1,
    devholmVersion,
    packages,
    updatedAt: latestUpdatedAt,
  });

  return {
    lockfileVersion: 1,
    devholmVersion,
    packages,
    updatedAt: latestUpdatedAt,
    lockfileChecksum,
  };
}

/**
 * Lock a plugin to a specific version
 */
export async function lockPluginVersion(
  pluginId: string,
  version: string,
  devholmVersion: string,
  source: PluginPackageSource,
  integrity: PluginPackageIntegrity,
  lockedBy?: string
): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db('plugin_lockfile')
    .insert({
      plugin_id: pluginId,
      version,
      devholm_version: devholmVersion,
      lockfile_checksum: sha256Hex({ pluginId, version, devholmVersion }),
      package_source: JSON.stringify(source),
      package_checksum: integrity.packageChecksum,
      manifest_checksum: integrity.manifestChecksum,
      migration_checksums: JSON.stringify(integrity.migrationChecksums),
      locked_by: lockedBy,
      locked_at: now,
      updated_at: now,
    })
    .onConflict('plugin_id')
    .merge({
      version,
      devholm_version: devholmVersion,
      package_source: JSON.stringify(source),
      package_checksum: integrity.packageChecksum,
      manifest_checksum: integrity.manifestChecksum,
      migration_checksums: JSON.stringify(integrity.migrationChecksums),
      locked_by: lockedBy,
      updated_at: now,
    });
}

/**
 * Get update pin for a plugin
 */
export async function getPluginUpdatePin(pluginId: string): Promise<PluginUpdatePin | null> {
  const db = getDb();
  const row = await db('plugin_update_pins').where({ plugin_id: pluginId }).first();

  if (!row) {
    return null;
  }

  return {
    exactVersion: row.exact_version,
    compatibleRange: row.compatible_range,
    channel: row.channel,
    policy: row.policy,
  };
}

/**
 * Set update pin for a plugin
 */
export async function setPluginUpdatePin(
  pluginId: string,
  pin: Partial<PluginUpdatePin>
): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db('plugin_update_pins')
    .insert({
      plugin_id: pluginId,
      exact_version: pin.exactVersion || null,
      compatible_range: pin.compatibleRange || null,
      channel: pin.channel || null,
      policy: pin.policy || 'manual',
      created_at: now,
      updated_at: now,
    })
    .onConflict('plugin_id')
    .merge({
      exact_version: pin.exactVersion !== undefined ? pin.exactVersion : undefined,
      compatible_range: pin.compatibleRange !== undefined ? pin.compatibleRange : undefined,
      channel: pin.channel !== undefined ? pin.channel : undefined,
      policy: pin.policy || undefined,
      updated_at: now,
    });
}

/**
 * Set update policy for a plugin
 */
export async function setPluginUpdatePolicy(
  pluginId: string,
  policy: PluginUpdatePolicy
): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db('plugin_update_pins')
    .insert({
      plugin_id: pluginId,
      policy,
      created_at: now,
      updated_at: now,
    })
    .onConflict('plugin_id')
    .merge({
      policy,
      updated_at: now,
    });
}

/**
 * Record a plugin update in history
 */
export async function recordPluginUpdate(
  pluginId: string,
  fromVersion: string,
  toVersion: string,
  status: 'success' | 'failed' | 'rolled_back',
  appliedBy?: string
): Promise<PluginUpdateRecord> {
  const db = getDb();
  const now = new Date();

  await db('plugin_update_history').insert({
    plugin_id: pluginId,
    from_version: fromVersion,
    to_version: toVersion,
    status,
    applied_by: appliedBy,
    applied_at: now,
    rollback_available_until: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  return {
    pluginId,
    fromVersion,
    toVersion,
    status,
    appliedAt: now.toISOString(),
    appliedBy,
    rollbackAvailableUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Get update history for a plugin
 */
export async function getPluginUpdateHistory(pluginId: string): Promise<PluginUpdateRecord[]> {
  const db = getDb();
  const rows = await db('plugin_update_history')
    .where({ plugin_id: pluginId })
    .orderBy('applied_at', 'desc')
    .limit(20);

  return rows.map((row) => ({
    pluginId: row.plugin_id,
    fromVersion: row.from_version,
    toVersion: row.to_version,
    status: row.status,
    appliedAt: row.applied_at.toISOString(),
    appliedBy: row.applied_by,
    rollbackAvailableUntil: row.rollback_available_until?.toISOString(),
    lastCheckpoint: row.last_checkpoint ? JSON.parse(row.last_checkpoint) : undefined,
  }));
}

/**
 * Get the most recent successful update for a plugin
 */
export async function getLastSuccessfulUpdate(
  pluginId: string
): Promise<PluginUpdateRecord | null> {
  const db = getDb();
  const row = await db('plugin_update_history')
    .where({ plugin_id: pluginId, status: 'success' })
    .orderBy('applied_at', 'desc')
    .first();

  if (!row) {
    return null;
  }

  return {
    pluginId: row.plugin_id,
    fromVersion: row.from_version,
    toVersion: row.to_version,
    status: row.status,
    appliedAt: row.applied_at.toISOString(),
    appliedBy: row.applied_by,
    rollbackAvailableUntil: row.rollback_available_until?.toISOString(),
    lastCheckpoint: row.last_checkpoint ? JSON.parse(row.last_checkpoint) : undefined,
  };
}
