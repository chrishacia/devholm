/**
 * CLI helpers for plugin versioning commands
 * Used by admin CLI and programmatic access
 */

import {
  getPluginLock,
  getAllPluginLocks,
  setPluginUpdatePin,
  getPluginUpdatePin,
  getPluginUpdateHistory,
} from '@core/db/plugin-versioning';
import {
  buildUpdatePreflight,
  findLatestCompatibleVersion,
} from '@core/lib/plugin-versioning.server';
import { getBundledPluginManifests } from '@core/lib/plugin-registry.server';
import type {
  PluginUpdatePin,
  PluginUpdatePreflight,
  PluginUpdateRecord,
} from '@core/types/plugins';

/**
 * Get plugin version information
 */
export async function getPluginVersionInfo(pluginId: string) {
  const lock = await getPluginLock(pluginId);
  const pin = await getPluginUpdatePin(pluginId);
  const history = await getPluginUpdateHistory(pluginId);

  const manifests = getBundledPluginManifests();
  const manifest = manifests.find((m) => m.id === pluginId);

  if (!manifest) {
    throw new Error(`Plugin manifest not found for ${pluginId}`);
  }

  return {
    pluginId,
    currentVersion: lock?.version || manifest.version,
    manifest: {
      version: manifest.version,
      devholmVersion: manifest.devholmVersion,
      dependencies: manifest.dependencies?.plugins,
    },
    pin: pin || { policy: 'manual' as const },
    recentUpdates: history.slice(0, 5),
    lock,
  };
}

/**
 * List all plugin versions with status
 */
export async function listPluginVersions() {
  const lockfile = await getAllPluginLocks();
  const manifests = getBundledPluginManifests();
  const results = [];

  for (const manifest of manifests) {
    const lock = lockfile.packages[manifest.id];
    const pin = await getPluginUpdatePin(manifest.id);
    const latestVersion = findLatestCompatibleVersion(
      [manifest.version, '1.0.0'], // would be extended with registry versions
      pin?.compatibleRange || '*'
    );

    results.push({
      id: manifest.id,
      name: manifest.name,
      installedVersion: lock?.version || manifest.version,
      availableVersion: latestVersion,
      updateAvailable: latestVersion && latestVersion !== lock?.version,
      policy: pin?.policy || 'manual',
      pin: pin?.exactVersion || pin?.compatibleRange,
    });
  }

  return results;
}

/**
 * Set update pin for a plugin
 */
export async function setPluginPin(
  pluginId: string,
  options: {
    policy?: 'manual' | 'stable' | 'beta';
    exactVersion?: string;
    range?: string;
    channel?: 'stable' | 'beta' | 'alpha';
  }
): Promise<PluginUpdatePin> {
  const pin: Partial<PluginUpdatePin> = {
    policy: options.policy || 'manual',
    exactVersion: options.exactVersion,
    compatibleRange: options.range,
    channel: options.channel,
  };

  await setPluginUpdatePin(pluginId, pin);

  const updated = await getPluginUpdatePin(pluginId);
  if (!updated) {
    throw new Error(`Failed to set pin for plugin ${pluginId}`);
  }

  return updated;
}

/**
 * Get update preflight (dry-run preview)
 */
export async function getUpdatePreflight(
  pluginId: string,
  proposedVersion: string,
  devholmVersion: string
): Promise<PluginUpdatePreflight> {
  const lock = await getPluginLock(pluginId);
  if (!lock) {
    throw new Error(`Plugin ${pluginId} not locked`);
  }

  // Find manifest from bundled plugins
  const manifests = getBundledPluginManifests();
  const currentManifest = manifests.find((m) => m.id === pluginId);
  const proposedManifest = manifests.find((m) => m.id === pluginId); // would fetch from registry

  if (!currentManifest || !proposedManifest) {
    throw new Error(`Plugin manifest not found for ${pluginId}`);
  }

  // Pre-fetch all plugin locks for dependency checking
  const allLocks = await getAllPluginLocks();
  const lockMap = new Map(
    allLocks.packages ? Object.entries(allLocks.packages).map(([id, pkg]) => [id, pkg.version]) : []
  );

  return buildUpdatePreflight(
    pluginId,
    lock.version,
    proposedVersion,
    devholmVersion,
    currentManifest,
    proposedManifest,
    (depId: string): string | undefined => {
      // Return version from pre-fetched locks
      return lockMap.get(depId);
    }
  );
}

/**
 * Get plugin update history
 */
export async function getPluginHistory(
  pluginId: string,
  limit: number = 10
): Promise<PluginUpdateRecord[]> {
  return getPluginUpdateHistory(pluginId).then((h) => h.slice(0, limit));
}

/**
 * Format plugin version info for display
 */
export function formatVersionInfo(info: Awaited<ReturnType<typeof getPluginVersionInfo>>): string {
  const lines = [
    `Plugin: ${info.pluginId}`,
    `Current Version: ${info.currentVersion}`,
    `Manifest Version: ${info.manifest.version}`,
    `DevHolm Requirement: ${info.manifest.devholmVersion || 'none'}`,
    `Update Policy: ${info.pin.policy}`,
  ];

  if (info.pin.exactVersion) {
    lines.push(`Pinned to: ${info.pin.exactVersion}`);
  }

  if (info.pin.compatibleRange) {
    lines.push(`Compatible Range: ${info.pin.compatibleRange}`);
  }

  if (info.recentUpdates.length > 0) {
    lines.push('\nRecent Updates:');
    for (const update of info.recentUpdates) {
      lines.push(
        `  ${update.fromVersion} → ${update.toVersion} (${update.status}) on ${update.appliedAt}`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Format version list for display
 */
export function formatVersionList(plugins: Awaited<ReturnType<typeof listPluginVersions>>): string {
  if (plugins.length === 0) {
    return 'No plugins installed';
  }

  const lines = [
    'Installed Plugins:',
    '',
    ['ID'.padEnd(20), 'Version'.padEnd(12), 'Policy'.padEnd(10), 'Status'.padEnd(20)].join('  '),
    '─'.repeat(80),
  ];

  for (const plugin of plugins) {
    const status = plugin.updateAvailable
      ? `Update available: ${plugin.availableVersion}`
      : 'Current';
    lines.push(
      [
        plugin.id.padEnd(20),
        plugin.installedVersion.padEnd(12),
        plugin.policy.padEnd(10),
        status.padEnd(20),
      ].join('  ')
    );
  }

  return lines.join('\n');
}
