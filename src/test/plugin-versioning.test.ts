import { describe, it, expect } from 'vitest';
import {
  isCompatibleWithDevholm,
  isDependencySatisfied,
  checkDependencyCompatibility,
  buildUpdatePreflight,
  findCompatibleVersions,
  findLatestCompatibleVersion,
} from '@core/lib/plugin-versioning.server';
import type { DevholmPluginManifest } from '@core/types/plugins';

describe('plugin-versioning: compatibility checking', () => {
  describe('isCompatibleWithDevholm', () => {
    it('allows plugin without DevHolm version requirement', () => {
      const result = isCompatibleWithDevholm('1.0.0', undefined, '3.11.0');
      expect(result.compatible).toBe(true);
    });

    it('accepts compatible DevHolm versions', () => {
      const result = isCompatibleWithDevholm('1.0.0', '>=3.0.0', '3.11.0');
      expect(result.compatible).toBe(true);
    });

    it('rejects incompatible DevHolm versions', () => {
      const result = isCompatibleWithDevholm('1.0.0', '>=4.0.0', '3.11.0');
      expect(result.compatible).toBe(false);
    });

    it('handles pre-release versions', () => {
      const result = isCompatibleWithDevholm('1.0.0', '>=3.11.0-beta', '3.11.0-beta.1');
      expect(result.compatible).toBe(true);
    });

    it('validates DevHolm version format', () => {
      const result = isCompatibleWithDevholm('1.0.0', '>=3.0.0', 'invalid');
      expect(result.compatible).toBe(false);
    });

    it('validates range format', () => {
      const result = isCompatibleWithDevholm('1.0.0', 'invalid-range', '3.11.0');
      expect(result.compatible).toBe(false);
    });
  });

  describe('isDependencySatisfied', () => {
    it('detects missing dependencies', () => {
      const result = isDependencySatisfied('url-shortener', '^1.0.0', undefined);
      expect(result.satisfied).toBe(false);
    });

    it('accepts compatible dependency versions', () => {
      const result = isDependencySatisfied('url-shortener', '^1.0.0', '1.2.3');
      expect(result.satisfied).toBe(true);
    });

    it('rejects incompatible dependency versions', () => {
      const result = isDependencySatisfied('url-shortener', '^1.0.0', '2.0.0');
      expect(result.satisfied).toBe(false);
    });

    it('handles pre-release dependency versions', () => {
      const result = isDependencySatisfied('url-shortener', '>=1.0.0-beta', '1.0.0-beta.1');
      expect(result.satisfied).toBe(true);
    });
  });

  describe('checkDependencyCompatibility', () => {
    it('accepts manifest with no dependencies', () => {
      const manifest: DevholmPluginManifest = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        enablementSettingKey: 'plugin:test:enabled',
      };

      const result = checkDependencyCompatibility(manifest, () => undefined);
      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('validates all plugin dependencies', () => {
      const manifest: DevholmPluginManifest = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        enablementSettingKey: 'plugin:test:enabled',
        dependencies: {
          plugins: {
            'dep-a': '^1.0.0',
            'dep-b': '^2.0.0',
          },
        },
      };

      const getVersion = (pluginId: string) => {
        if (pluginId === 'dep-a') return '1.2.3';
        if (pluginId === 'dep-b') return '1.9.0'; // incompatible
        return undefined;
      };

      const result = checkDependencyCompatibility(manifest, getVersion);
      expect(result.compatible).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

describe('plugin-versioning: update planning', () => {
  describe('buildUpdatePreflight', () => {
    const currentManifest: DevholmPluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      devholmVersion: '>=3.0.0',
      enablementSettingKey: 'plugin:test-plugin:enabled',
      dependencies: {
        plugins: {
          'core-dep': '^1.0.0',
        },
      },
      migrations: [
        {
          id: 'test-plugin:001_initial',
          file: 'db/migrations/001_initial.sql',
          reversibility: 'reversible',
        },
      ],
    };

    const proposedManifest: DevholmPluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '2.0.0',
      devholmVersion: '>=3.10.0',
      enablementSettingKey: 'plugin:test-plugin:enabled',
      dependencies: {
        plugins: {
          'core-dep': '^2.0.0',
        },
      },
      migrations: [
        {
          id: 'test-plugin:001_initial',
          file: 'db/migrations/001_initial.sql',
          reversibility: 'reversible',
        },
        {
          id: 'test-plugin:002_upgrade_v2',
          file: 'db/migrations/002_upgrade_v2.sql',
          reversibility: 'irreversible',
          irreversibleWarning: 'Column drop cannot be reversed',
        },
      ],
    };

    it('builds preflight for compatible upgrade', () => {
      const preflight = buildUpdatePreflight(
        'test-plugin',
        '1.0.0',
        '2.0.0',
        '3.11.0',
        currentManifest,
        proposedManifest,
        (pluginId) => (pluginId === 'core-dep' ? '2.1.0' : undefined)
      );

      expect(preflight.pluginId).toBe('test-plugin');
      expect(preflight.currentVersion).toBe('1.0.0');
      expect(preflight.proposedVersion).toBe('2.0.0');
      expect(preflight.isCompatibleWithCurrentDevholm).toBe(true);
      expect(preflight.migrationsToApply).toHaveLength(1);
      expect(preflight.migrationsToApply[0].id).toBe('test-plugin:002_upgrade_v2');
      expect(preflight.irreversibleChanges.length).toBeGreaterThan(0);
    });

    it('detects incompatible DevHolm version', () => {
      const preflight = buildUpdatePreflight(
        'test-plugin',
        '1.0.0',
        '2.0.0',
        '3.9.0', // Proposed requires >=3.10.0
        currentManifest,
        proposedManifest,
        () => undefined
      );

      expect(preflight.isCompatibleWithCurrentDevholm).toBe(false);
      expect(preflight.warnings.length).toBeGreaterThan(0);
    });

    it('detects incompatible dependencies', () => {
      const preflight = buildUpdatePreflight(
        'test-plugin',
        '1.0.0',
        '2.0.0',
        '3.11.0',
        currentManifest,
        proposedManifest,
        (pluginId) => (pluginId === 'core-dep' ? '1.5.0' : undefined) // Requires '^2.0.0'
      );

      expect(preflight.isCompatibleWithDependencies).toBe(false);
      expect(preflight.warnings.length).toBeGreaterThan(0);
    });

    it('detects dependency upgrades', () => {
      const preflight = buildUpdatePreflight(
        'test-plugin',
        '1.0.0',
        '2.0.0',
        '3.11.0',
        currentManifest,
        proposedManifest,
        (pluginId) => (pluginId === 'core-dep' ? '2.0.0' : undefined)
      );

      expect(preflight.dependencyChanges?.upgraded['core-dep']).toEqual({
        from: '^1.0.0',
        to: '^2.0.0',
      });
    });
  });
});

describe('plugin-versioning: version selection', () => {
  const availableVersions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0', '2.1.0', '2.1.1'];

  describe('findCompatibleVersions', () => {
    it('finds all compatible versions for range', () => {
      const compatible = findCompatibleVersions(availableVersions, '^1.0.0');
      expect(compatible).toEqual(['1.0.0', '1.1.0', '1.2.0']);
    });

    it('returns empty array for invalid range', () => {
      const compatible = findCompatibleVersions(availableVersions, 'invalid-range');
      expect(compatible).toHaveLength(0);
    });

    it('handles exact version specifier', () => {
      const compatible = findCompatibleVersions(availableVersions, '1.2.0');
      expect(compatible).toEqual(['1.2.0']);
    });
  });

  describe('findLatestCompatibleVersion', () => {
    it('finds latest compatible version', () => {
      const latest = findLatestCompatibleVersion(availableVersions, '^1.0.0');
      expect(latest).toBe('1.2.0');
    });

    it('returns undefined when no compatible versions', () => {
      const latest = findLatestCompatibleVersion(availableVersions, '^3.0.0');
      expect(latest).toBeUndefined();
    });

    it('finds latest for major version range', () => {
      const latest = findLatestCompatibleVersion(availableVersions, '>=2.0.0');
      expect(latest).toBe('2.1.1');
    });
  });
});
