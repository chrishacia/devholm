/**
 * Tests for public route adapters
 *
 * Verifies that real adapter implementations enforce read-only constraints
 * and properly wrap database and settings access.
 */

import { describe, it, expect, vi } from 'vitest';
import { createReadOnlySettingsAccessor } from '@core/lib/public-route-adapters.server';

describe('Public Route Adapters - Settings Accessor', () => {
  describe('get()', () => {
    it('should call the real getSetting function', async () => {
      const getSetting = vi.fn().mockResolvedValue('test-value');
      const getSettings = vi.fn();

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);
      const result = await accessor.get('plugin:test:enabled');

      expect(getSetting).toHaveBeenCalledWith('plugin:test:enabled');
      expect(result).toBe('test-value');
    });

    it('should return undefined when setting does not exist', async () => {
      const getSetting = vi.fn().mockResolvedValue(undefined);
      const getSettings = vi.fn();

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);
      const result = await accessor.get('nonexistent:key');

      expect(result).toBeUndefined();
    });

    it('should wrap database errors with context', async () => {
      const getSetting = vi.fn().mockRejectedValue(new Error('Database connection failed'));
      const getSettings = vi.fn();

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);

      await expect(accessor.get('some:key')).rejects.toThrow(
        'Failed to read site setting "some:key": Database connection failed'
      );
    });

    it('should handle non-Error exceptions', async () => {
      const getSetting = vi.fn().mockRejectedValue('String error message');
      const getSettings = vi.fn();

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);

      await expect(accessor.get('key')).rejects.toThrow(
        'Failed to read site setting "key": String error message'
      );
    });

    it('should return typed values unchanged', async () => {
      const getSetting = vi.fn().mockResolvedValue(true);
      const getSettings = vi.fn();

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);
      const result = await accessor.get('boolean:setting');

      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getMany()', () => {
    it('should call getSettings with array of keys', async () => {
      const getSetting = vi.fn();
      const getSettings = vi.fn().mockResolvedValue({
        key1: 'value1',
        key2: 'value2',
      });

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);
      const result = await accessor.getMany(['key1', 'key2']);

      expect(getSettings).toHaveBeenCalledWith(['key1', 'key2']);
      expect(result).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should handle readonly key arrays', async () => {
      const getSetting = vi.fn();
      const getSettings = vi.fn().mockResolvedValue({ a: 1 });

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);
      const keys: readonly string[] = ['a'];
      const result = await accessor.getMany(keys);

      expect(getSettings).toHaveBeenCalledWith(['a']);
      expect(result).toEqual({ a: 1 });
    });

    it('should return empty object for empty key list', async () => {
      const getSetting = vi.fn();
      const getSettings = vi.fn().mockResolvedValue({});

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);
      const result = await accessor.getMany([]);

      expect(getSettings).toHaveBeenCalledWith([]);
      expect(result).toEqual({});
    });

    it('should wrap read errors from getSettings', async () => {
      const getSetting = vi.fn();
      const getSettings = vi.fn().mockRejectedValue(new Error('Query timeout'));

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);

      await expect(accessor.getMany(['key1', 'key2'])).rejects.toThrow(
        'Failed to read site settings: Query timeout'
      );
    });

    it('should not call getSetting when using getMany', async () => {
      const getSetting = vi.fn();
      const getSettings = vi.fn().mockResolvedValue({ a: 1, b: 2 });

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);
      await accessor.getMany(['a', 'b']);

      expect(getSetting).not.toHaveBeenCalled();
      expect(getSettings).toHaveBeenCalled();
    });
  });

  describe('Integration', () => {
    it('should work with real settings flow', async () => {
      const getSetting = vi.fn(async (key: string) => {
        const settings: Record<string, unknown> = {
          'plugin:test:enabled': true,
          'site:title': 'My Site',
        };
        return settings[key];
      });

      const getSettings = vi.fn(async (keys: string[]) => {
        const settings: Record<string, unknown> = {
          'plugin:test:enabled': true,
          'site:title': 'My Site',
        };
        return keys.reduce(
          (acc, key) => {
            if (key in settings) {
              acc[key] = settings[key];
            }
            return acc;
          },
          {} as Record<string, unknown>
        );
      });

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);

      // Single get
      const enabled = await accessor.get('plugin:test:enabled');
      expect(enabled).toBe(true);

      // Multiple gets
      const values = await accessor.getMany(['plugin:test:enabled', 'site:title']);
      expect(values).toEqual({
        'plugin:test:enabled': true,
        'site:title': 'My Site',
      });
    });

    it('should only expose get and getMany methods', async () => {
      const getSetting = vi.fn();
      const getSettings = vi.fn();

      const accessor = createReadOnlySettingsAccessor(getSetting, getSettings);

      // Ensure no other methods exist
      expect(typeof accessor.get).toBe('function');
      expect(typeof accessor.getMany).toBe('function');
      expect(Object.keys(accessor)).toEqual(['get', 'getMany']);
    });
  });
});
