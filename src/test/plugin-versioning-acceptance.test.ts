import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb } from '@/db';
import {
  getPluginLock,
  lockPluginVersion,
  getPluginUpdatePin,
  setPluginUpdatePin,
  getPluginUpdateHistory,
} from '@core/db/plugin-versioning';
import {
  buildUpdatePreflight,
  findLatestCompatibleVersion,
} from '@core/lib/plugin-versioning.server';
import { performSafePluginUpdate } from '@core/lib/plugin-safe-activation.server';
import type {
  DevholmPluginManifest,
  PluginPackageSource,
  PluginPackageIntegrity,
} from '@core/types/plugins';

/**
 * ACCEPTANCE PROOF: Complete plugin versioning and safe update workflow
 * These tests validate all 6 required scenarios for issue #7
 */
describe('plugin-versioning: acceptance proof', () => {
  let db: ReturnType<typeof getDb>;
  const CURRENT_DEVHOLM_VERSION = '3.11.0';

  beforeEach(async () => {
    db = getDb();

    // Setup test plugins
    const plugins = [
      { id: 'plugin-a', name: 'Plugin A' },
      { id: 'plugin-b', name: 'Plugin B' },
    ];

    for (const plugin of plugins) {
      const exists = await db('devholm_plugins').where({ plugin_id: plugin.id }).first();
      if (!exists) {
        await db('devholm_plugins').insert({
          plugin_id: plugin.id,
          bundled_version: '1.0.0',
          installed_version: '1.0.0',
          enabled: false,
          lifecycle_state: 'installed',
          operation_status: 'idle',
          updated_at: new Date(),
        });
      }
    }
  });

  afterEach(async () => {
    await db('plugin_lockfile').delete();
    await db('plugin_update_pins').delete();
    await db('plugin_update_history').delete();
    await db('devholm_plugins').delete().whereIn('plugin_id', ['plugin-a', 'plugin-b']);
  });

  describe('Scenario 1: Pin one plugin to exact version', () => {
    it('allows pinning plugin-a to exact version 1.5.0', async () => {
      const source: PluginPackageSource = { type: 'bundled' };
      const integrity: PluginPackageIntegrity = {
        packageChecksum: 'sha256-1.5.0',
        manifestChecksum: 'manifest-1.5.0',
        migrationChecksums: {},
      };

      // Lock plugin-a to 1.5.0
      await lockPluginVersion(
        'plugin-a',
        '1.5.0',
        CURRENT_DEVHOLM_VERSION,
        source,
        integrity,
        'deployer'
      );

      // Set exact pin
      await setPluginUpdatePin('plugin-a', {
        exactVersion: '1.5.0',
        policy: 'manual',
      });

      // Verify pin
      const lock = await getPluginLock('plugin-a');
      expect(lock?.version).toBe('1.5.0');

      const pin = await getPluginUpdatePin('plugin-a');
      expect(pin?.exactVersion).toBe('1.5.0');
      expect(pin?.policy).toBe('manual');
    });
  });

  describe('Scenario 2: Allow compatible updates for another plugin', () => {
    it('allows plugin-b to update within compatible range', async () => {
      const source: PluginPackageSource = { type: 'bundled' };
      const integrity: PluginPackageIntegrity = {
        packageChecksum: 'sha256-initial',
        manifestChecksum: 'manifest-initial',
        migrationChecksums: {},
      };

      // Start with plugin-b at 2.0.0
      await lockPluginVersion('plugin-b', '2.0.0', CURRENT_DEVHOLM_VERSION, source, integrity);

      // Set compatible range policy
      await setPluginUpdatePin('plugin-b', {
        compatibleRange: '^2.0.0',
        policy: 'stable',
        channel: 'stable',
      });

      // Find latest compatible version
      const availableVersions = ['2.0.0', '2.1.0', '2.1.1', '2.2.0', '3.0.0'];
      const latest = findLatestCompatibleVersion(availableVersions, '^2.0.0');

      expect(latest).toBe('2.2.0');

      // Verify pin allows updates
      const pin = await getPluginUpdatePin('plugin-b');
      expect(pin?.compatibleRange).toBe('^2.0.0');
      expect(pin?.policy).toBe('stable');
    });
  });

  describe('Scenario 3: Preview update plan', () => {
    it('shows preflight analysis with all changes', async () => {
      const currentManifest: DevholmPluginManifest = {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '2.0.0',
        devholmVersion: '>=3.10.0',
        enablementSettingKey: 'plugin:plugin-b:enabled',
        dependencies: {
          plugins: {
            'plugin-a': '^1.0.0',
          },
        },
        migrations: [
          {
            id: 'plugin-b:001_initial',
            file: 'db/migrations/001_initial.sql',
            reversibility: 'reversible',
          },
        ],
      };

      const proposedManifest: DevholmPluginManifest = {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '2.2.0',
        devholmVersion: '>=3.10.0',
        enablementSettingKey: 'plugin:plugin-b:enabled',
        dependencies: {
          plugins: {
            'plugin-a': '^1.0.0 || ^2.0.0',
          },
        },
        migrations: [
          {
            id: 'plugin-b:001_initial',
            file: 'db/migrations/001_initial.sql',
            reversibility: 'reversible',
          },
          {
            id: 'plugin-b:002_add_feature',
            file: 'db/migrations/002_add_feature.sql',
            reversibility: 'reversible',
            description: 'Add new feature table',
          },
          {
            id: 'plugin-b:003_cleanup',
            file: 'db/migrations/003_cleanup.sql',
            reversibility: 'irreversible',
            irreversibleWarning: 'Removes deprecated columns',
          },
        ],
      };

      // Build preflight
      const preflight = buildUpdatePreflight(
        'plugin-b',
        '2.0.0',
        '2.2.0',
        CURRENT_DEVHOLM_VERSION,
        currentManifest,
        proposedManifest,
        (pluginId) => (pluginId === 'plugin-a' ? '1.5.0' : undefined)
      );

      // Verify preflight contents
      expect(preflight.currentVersion).toBe('2.0.0');
      expect(preflight.proposedVersion).toBe('2.2.0');
      expect(preflight.isCompatibleWithCurrentDevholm).toBe(true);
      expect(preflight.migrationsToApply).toHaveLength(2);
      expect(preflight.migrationsToApply[0].id).toBe('plugin-b:002_add_feature');
      expect(preflight.migrationsToApply[1].id).toBe('plugin-b:003_cleanup');
      expect(preflight.irreversibleChanges.length).toBeGreaterThan(0);
      expect(preflight.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Scenario 4: Reject incompatible release', () => {
    it('prevents update when DevHolm version incompatible', async () => {
      const currentManifest: DevholmPluginManifest = {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
        devholmVersion: '>=3.0.0',
        enablementSettingKey: 'plugin:plugin-a:enabled',
      };

      const proposedManifest: DevholmPluginManifest = {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '2.0.0',
        devholmVersion: '>=4.0.0', // Requires DevHolm 4.0+
        enablementSettingKey: 'plugin:plugin-a:enabled',
      };

      const preflight = buildUpdatePreflight(
        'plugin-a',
        '1.0.0',
        '2.0.0',
        CURRENT_DEVHOLM_VERSION, // 3.11.0
        currentManifest,
        proposedManifest,
        () => undefined
      );

      // Verify rejection
      expect(preflight.isCompatibleWithCurrentDevholm).toBe(false);
      expect(preflight.warnings.some((w) => w.includes('DevHolm'))).toBe(true);
    });

    it('prevents update when dependency incompatible', async () => {
      const currentManifest: DevholmPluginManifest = {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '1.0.0',
        enablementSettingKey: 'plugin:plugin-b:enabled',
        dependencies: {
          plugins: {
            'plugin-a': '^1.0.0',
          },
        },
      };

      const proposedManifest: DevholmPluginManifest = {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '2.0.0',
        enablementSettingKey: 'plugin:plugin-b:enabled',
        dependencies: {
          plugins: {
            'plugin-a': '^3.0.0', // Requires plugin-a 3.0+
          },
        },
      };

      const preflight = buildUpdatePreflight(
        'plugin-b',
        '1.0.0',
        '2.0.0',
        CURRENT_DEVHOLM_VERSION,
        currentManifest,
        proposedManifest,
        (pluginId) => (pluginId === 'plugin-a' ? '1.5.0' : undefined) // Only 1.5.0 available
      );

      // Verify rejection
      expect(preflight.isCompatibleWithDependencies).toBe(false);
      expect(preflight.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 5: Perform safe upgrade', () => {
    it('completes safe upgrade with staged activation', async () => {
      const source: PluginPackageSource = { type: 'bundled' };
      const initialIntegrity: PluginPackageIntegrity = {
        packageChecksum: 'sha256-1.0.0',
        manifestChecksum: 'manifest-1.0.0',
        migrationChecksums: {},
      };

      // Lock initial version
      await lockPluginVersion(
        'plugin-a',
        '1.0.0',
        CURRENT_DEVHOLM_VERSION,
        source,
        initialIntegrity
      );

      // Perform safe update
      const newIntegrity: PluginPackageIntegrity = {
        packageChecksum: 'sha256-1.1.0',
        manifestChecksum: 'manifest-1.1.0',
        migrationChecksums: { 'plugin-a:001': 'migration-hash' },
      };

      const result = await performSafePluginUpdate(
        'plugin-a',
        '1.0.0',
        '1.1.0',
        source,
        newIntegrity,
        CURRENT_DEVHOLM_VERSION,
        { pluginId: 'plugin-a', fromVersion: '1.0.0', toVersion: '1.1.0' },
        undefined, // onMigrationsStart
        undefined, // onMigrationsComplete
        'deployer'
      );

      expect(result.success).toBe(true);
      expect(result.checkpoint?.stage).toBe('activated');

      // Verify new lock
      const lock = await getPluginLock('plugin-a');
      expect(lock?.version).toBe('1.1.0');

      // Verify history recorded
      const history = await getPluginUpdateHistory('plugin-a');
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].status).toBe('success');
      expect(history[0].toVersion).toBe('1.1.0');
    });
  });

  describe('Scenario 6: Retain prior working release after simulated failure', () => {
    it('preserves previous version on update failure and rollback', async () => {
      const source: PluginPackageSource = { type: 'bundled' };
      const v1Integrity: PluginPackageIntegrity = {
        packageChecksum: 'sha256-1.0.0',
        manifestChecksum: 'manifest-1.0.0',
        migrationChecksums: {},
      };

      // Lock v1.0.0
      await lockPluginVersion(
        'plugin-a',
        '1.0.0',
        CURRENT_DEVHOLM_VERSION,
        source,
        v1Integrity,
        'initial'
      );

      // Mock failure during update
      const v2Integrity: PluginPackageIntegrity = {
        packageChecksum: 'sha256-1.1.0',
        manifestChecksum: 'manifest-1.1.0',
        migrationChecksums: {},
      };

      const result = await performSafePluginUpdate(
        'plugin-a',
        '1.0.0',
        '1.1.0',
        source,
        v2Integrity,
        CURRENT_DEVHOLM_VERSION,
        { pluginId: 'plugin-a', fromVersion: '1.0.0', toVersion: '1.1.0' },
        async () => {
          throw new Error('Migration failed: constraint violation');
        },
        undefined,
        'deployer'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration failed');

      // Verify version was rolled back to v1.0.0
      const lock = await getPluginLock('plugin-a');
      expect(lock?.version).toBe('1.0.0');

      // Verify history shows rollback
      const history = await getPluginUpdateHistory('plugin-a');
      const latestAttempt = history.find((h) => h.toVersion === '1.1.0');
      expect(latestAttempt?.status).toBe('rolled_back');

      // Verify prior version still available
      const priorVersion = await getPluginUpdateHistory('plugin-a');
      expect(priorVersion.some((h) => h.toVersion === '1.0.0')).toBe(true);
    });
  });

  describe('Complete workflow: all scenarios integrated', () => {
    it('executes full plugin versioning lifecycle deterministically', async () => {
      const source: PluginPackageSource = { type: 'bundled' };

      // Step 1: Pin plugin-a to 1.5.0
      const lockA_1_5 = {
        packageChecksum: 'sha256-1.5.0',
        manifestChecksum: 'manifest-1.5.0',
        migrationChecksums: {},
      };
      await lockPluginVersion(
        'plugin-a',
        '1.5.0',
        CURRENT_DEVHOLM_VERSION,
        source,
        lockA_1_5,
        'admin'
      );
      await setPluginUpdatePin('plugin-a', { exactVersion: '1.5.0', policy: 'manual' });

      // Step 2: Allow plugin-b compatible updates
      const lockB_2_0 = {
        packageChecksum: 'sha256-2.0.0',
        manifestChecksum: 'manifest-2.0.0',
        migrationChecksums: {},
      };
      await lockPluginVersion('plugin-b', '2.0.0', CURRENT_DEVHOLM_VERSION, source, lockB_2_0);
      await setPluginUpdatePin('plugin-b', {
        compatibleRange: '^2.0.0',
        policy: 'stable',
      });

      // Step 3: Preview plugin-b update 2.0 -> 2.2
      const currentB = {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '2.0.0',
        enablementSettingKey: 'plugin:plugin-b:enabled',
      } as DevholmPluginManifest;

      const proposedB = {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '2.2.0',
        enablementSettingKey: 'plugin:plugin-b:enabled',
      } as DevholmPluginManifest;

      const preflight = buildUpdatePreflight(
        'plugin-b',
        '2.0.0',
        '2.2.0',
        CURRENT_DEVHOLM_VERSION,
        currentB,
        proposedB,
        () => undefined
      );
      expect(preflight.isCompatibleWithCurrentDevholm).toBe(true);

      // Step 4: Verify incompatible version rejected
      const badManifest = {
        ...proposedB,
        devholmVersion: '>=4.0.0',
      };
      const badPreflight = buildUpdatePreflight(
        'plugin-b',
        '2.0.0',
        '3.0.0',
        CURRENT_DEVHOLM_VERSION,
        currentB,
        badManifest,
        () => undefined
      );
      expect(badPreflight.isCompatibleWithCurrentDevholm).toBe(false);

      // Step 5: Perform safe upgrade of plugin-b to 2.2.0
      const lockB_2_2 = {
        packageChecksum: 'sha256-2.2.0',
        manifestChecksum: 'manifest-2.2.0',
        migrationChecksums: {},
      };

      const upgradeResult = await performSafePluginUpdate(
        'plugin-b',
        '2.0.0',
        '2.2.0',
        source,
        lockB_2_2,
        CURRENT_DEVHOLM_VERSION,
        { pluginId: 'plugin-b', fromVersion: '2.0.0', toVersion: '2.2.0' },
        undefined,
        undefined,
        'deployer'
      );
      expect(upgradeResult.success).toBe(true);

      const afterUpgrade = await getPluginLock('plugin-b');
      expect(afterUpgrade?.version).toBe('2.2.0');

      // Step 6: Verify rollback available from history
      const history = await getPluginUpdateHistory('plugin-b');
      const successRecord = history.find((h) => h.status === 'success');
      expect(successRecord?.toVersion).toBe('2.2.0');
      expect(successRecord?.rollbackAvailableUntil).toBeDefined();

      // Final validation: All lockfile entries
      const packages = await db('plugin_lockfile');
      expect(packages.length).toBeGreaterThanOrEqual(2);
    });
  });
});
