import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb } from '@/db';
import {
  getPluginLock,
  getAllPluginLocks,
  lockPluginVersion,
  getPluginUpdatePin,
  setPluginUpdatePin,
  recordPluginUpdate,
  getPluginUpdateHistory,
  getLastSuccessfulUpdate,
} from '@core/db/plugin-versioning';
import type {
  PluginPackageSource,
  PluginPackageIntegrity,
  PluginUpdatePin,
} from '@core/types/plugins';

describe('plugin-versioning: lockfile management', () => {
  let db: ReturnType<typeof getDb>;

  beforeEach(async () => {
    db = getDb();

    // Ensure test database has plugin entries
    const exists = await db('devholm_plugins').where({ plugin_id: 'test-plugin' }).first();
    if (!exists) {
      await db('devholm_plugins').insert({
        plugin_id: 'test-plugin',
        bundled_version: '1.0.0',
        installed_version: '1.0.0',
        enabled: false,
        lifecycle_state: 'installed',
        operation_status: 'idle',
        updated_at: new Date(),
      });
    }
  });

  afterEach(async () => {
    // Clean up test data
    await db('plugin_lockfile').delete().where({ plugin_id: 'test-plugin' });
  });

  describe('lockPluginVersion', () => {
    it('creates new lock entry', async () => {
      const source: PluginPackageSource = { type: 'bundled' };
      const integrity: PluginPackageIntegrity = {
        packageChecksum: 'abc123',
        manifestChecksum: 'def456',
        migrationChecksums: { 'test-plugin:001': 'ghi789' },
      };

      await lockPluginVersion('test-plugin', '1.0.0', '3.11.0', source, integrity, 'test-user');

      const lock = await getPluginLock('test-plugin');
      expect(lock).not.toBeNull();
      expect(lock?.version).toBe('1.0.0');
      expect(lock?.integrity.packageChecksum).toBe('abc123');
      expect(lock?.lockedBy).toBe('test-user');
    });

    it('updates existing lock', async () => {
      const source: PluginPackageSource = { type: 'bundled' };
      const integrity: PluginPackageIntegrity = {
        packageChecksum: 'abc123',
        manifestChecksum: 'def456',
        migrationChecksums: {},
      };

      // Create initial lock
      await lockPluginVersion('test-plugin', '1.0.0', '3.11.0', source, integrity);

      // Update to new version
      const integrity2: PluginPackageIntegrity = {
        packageChecksum: 'new123',
        manifestChecksum: 'new456',
        migrationChecksums: {},
      };

      await lockPluginVersion('test-plugin', '2.0.0', '3.11.0', source, integrity2, 'upgrader');

      const lock = await getPluginLock('test-plugin');
      expect(lock?.version).toBe('2.0.0');
      expect(lock?.integrity.packageChecksum).toBe('new123');
    });
  });

  describe('getAllPluginLocks', () => {
    it('returns empty lockfile when no locks', async () => {
      const lockfile = await getAllPluginLocks();
      expect(lockfile.lockfileVersion).toBe(1);
      expect(lockfile.packages).toEqual({});
    });

    it('collects all plugin locks', async () => {
      const source: PluginPackageSource = { type: 'bundled' };
      const integrity: PluginPackageIntegrity = {
        packageChecksum: 'abc123',
        manifestChecksum: 'def456',
        migrationChecksums: {},
      };

      // Create a second plugin
      await db('devholm_plugins').insert({
        plugin_id: 'another-plugin',
        bundled_version: '1.0.0',
        installed_version: '1.0.0',
        enabled: false,
        lifecycle_state: 'installed',
        operation_status: 'idle',
        updated_at: new Date(),
      });

      await lockPluginVersion('test-plugin', '1.0.0', '3.11.0', source, integrity);
      await lockPluginVersion('another-plugin', '1.5.0', '3.11.0', source, integrity);

      const lockfile = await getAllPluginLocks();
      expect(Object.keys(lockfile.packages)).toHaveLength(2);
      expect(lockfile.packages['test-plugin'].version).toBe('1.0.0');
      expect(lockfile.packages['another-plugin'].version).toBe('1.5.0');

      // Clean up
      await db('devholm_plugins').delete().where({ plugin_id: 'another-plugin' });
    });
  });

  describe('getPluginLock', () => {
    it('returns null for non-existent lock', async () => {
      const lock = await getPluginLock('nonexistent');
      expect(lock).toBeNull();
    });

    it('retrieves existing lock with all metadata', async () => {
      const source: PluginPackageSource = {
        type: 'registry',
        registryUrl: 'https://registry.example.com',
        packageName: 'test-plugin',
      };
      const integrity: PluginPackageIntegrity = {
        packageChecksum: 'sha256abc',
        manifestChecksum: 'sha256def',
        migrationChecksums: {
          'test-plugin:001': 'sha256ghi',
          'test-plugin:002': 'sha256jkl',
        },
      };

      await lockPluginVersion('test-plugin', '1.2.3', '3.11.0', source, integrity, 'deployer');

      const lock = await getPluginLock('test-plugin');
      expect(lock?.version).toBe('1.2.3');
      expect(lock?.source.type).toBe('registry');
      if (lock?.source.type === 'registry') {
        expect(lock.source.registryUrl).toBe('https://registry.example.com');
      }
      expect(Object.keys(lock?.integrity.migrationChecksums || {})).toHaveLength(2);
    });
  });
});

describe('plugin-versioning: update pins', () => {
  let db: ReturnType<typeof getDb>;

  beforeEach(async () => {
    db = getDb();

    const exists = await db('devholm_plugins').where({ plugin_id: 'test-pin' }).first();
    if (!exists) {
      await db('devholm_plugins').insert({
        plugin_id: 'test-pin',
        bundled_version: '1.0.0',
        installed_version: '1.0.0',
        enabled: false,
        lifecycle_state: 'installed',
        operation_status: 'idle',
        updated_at: new Date(),
      });
    }
  });

  afterEach(async () => {
    await db('plugin_update_pins').delete().where({ plugin_id: 'test-pin' });
    await db('devholm_plugins').delete().where({ plugin_id: 'test-pin' });
  });

  describe('setPluginUpdatePin', () => {
    it('creates new pin entry', async () => {
      const pin: PluginUpdatePin = {
        exactVersion: '1.5.0',
        policy: 'manual',
      };

      await setPluginUpdatePin('test-pin', pin);

      const retrieved = await getPluginUpdatePin('test-pin');
      expect(retrieved?.exactVersion).toBe('1.5.0');
      expect(retrieved?.policy).toBe('manual');
    });

    it('creates compatible range pin', async () => {
      const pin: PluginUpdatePin = {
        compatibleRange: '^1.5.0',
        policy: 'stable',
        channel: 'stable',
      };

      await setPluginUpdatePin('test-pin', pin);

      const retrieved = await getPluginUpdatePin('test-pin');
      expect(retrieved?.compatibleRange).toBe('^1.5.0');
      expect(retrieved?.policy).toBe('stable');
      expect(retrieved?.channel).toBe('stable');
    });

    it('updates existing pin', async () => {
      await setPluginUpdatePin('test-pin', {
        exactVersion: '1.0.0',
        policy: 'manual',
      });

      await setPluginUpdatePin('test-pin', {
        exactVersion: '2.0.0',
        policy: 'stable',
      });

      const retrieved = await getPluginUpdatePin('test-pin');
      expect(retrieved?.exactVersion).toBe('2.0.0');
      expect(retrieved?.policy).toBe('stable');
    });
  });

  describe('getPluginUpdatePin', () => {
    it('returns null when no pin set', async () => {
      const pin = await getPluginUpdatePin('test-pin');
      expect(pin).toBeNull();
    });
  });
});

describe('plugin-versioning: update history', () => {
  let db: ReturnType<typeof getDb>;

  beforeEach(async () => {
    db = getDb();

    const exists = await db('devholm_plugins').where({ plugin_id: 'test-history' }).first();
    if (!exists) {
      await db('devholm_plugins').insert({
        plugin_id: 'test-history',
        bundled_version: '1.0.0',
        installed_version: '1.0.0',
        enabled: false,
        lifecycle_state: 'installed',
        operation_status: 'idle',
        updated_at: new Date(),
      });
    }
  });

  afterEach(async () => {
    await db('plugin_update_history').delete().where({ plugin_id: 'test-history' });
    await db('devholm_plugins').delete().where({ plugin_id: 'test-history' });
  });

  describe('recordPluginUpdate', () => {
    it('creates successful update record', async () => {
      const record = await recordPluginUpdate('test-history', '1.0.0', '1.1.0', 'success', 'admin');

      expect(record.pluginId).toBe('test-history');
      expect(record.fromVersion).toBe('1.0.0');
      expect(record.toVersion).toBe('1.1.0');
      expect(record.status).toBe('success');
      expect(record.appliedBy).toBe('admin');
    });

    it('creates failed update record', async () => {
      const record = await recordPluginUpdate(
        'test-history',
        '1.0.0',
        '1.1.0',
        'failed',
        'deployer'
      );

      expect(record.status).toBe('failed');
    });

    it('creates rollback record', async () => {
      const record = await recordPluginUpdate(
        'test-history',
        '1.1.0',
        '1.0.0',
        'rolled_back',
        'admin'
      );

      expect(record.status).toBe('rolled_back');
    });
  });

  describe('getPluginUpdateHistory', () => {
    it('returns empty array for plugin with no history', async () => {
      const history = await getPluginUpdateHistory('test-history');
      expect(history).toEqual([]);
    });

    it('returns update history ordered by date descending', async () => {
      await recordPluginUpdate('test-history', '1.0.0', '1.1.0', 'success');
      await new Promise((r) => setTimeout(r, 10));
      await recordPluginUpdate('test-history', '1.1.0', '1.2.0', 'success');

      const history = await getPluginUpdateHistory('test-history');
      expect(history).toHaveLength(2);
      expect(history[0].toVersion).toBe('1.2.0');
      expect(history[1].toVersion).toBe('1.1.0');
    });
  });

  describe('getLastSuccessfulUpdate', () => {
    it('returns null when no successful updates', async () => {
      await recordPluginUpdate('test-history', '1.0.0', '1.1.0', 'failed');

      const last = await getLastSuccessfulUpdate('test-history');
      expect(last).toBeNull();
    });

    it('returns most recent successful update', async () => {
      await recordPluginUpdate('test-history', '1.0.0', '1.1.0', 'success');
      await new Promise((r) => setTimeout(r, 10));
      await recordPluginUpdate('test-history', '1.1.0', '1.2.0', 'success');
      await new Promise((r) => setTimeout(r, 10));
      await recordPluginUpdate('test-history', '1.2.0', '1.3.0', 'failed');

      const last = await getLastSuccessfulUpdate('test-history');
      expect(last?.fromVersion).toBe('1.1.0');
      expect(last?.toVersion).toBe('1.2.0');
    });
  });
});
