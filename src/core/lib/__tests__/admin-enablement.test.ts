/**
 * Admin Page Enablement Tests
 *
 * Tests that disabled plugin admin pages are not loaded,
 * while enabled plugin admin pages are loaded correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AdminPageExtension } from '@core/types/extensions.server';
import type { Metadata } from 'next';

/**
 * Core injectable function to test admin enablement logic
 * This would be the injectable version similar to dispatchPublicRoute
 */
async function getAdminPageComponentCore(
  extension: AdminPageExtension | null,
  isPluginEnabled: (pluginId: string | undefined) => Promise<boolean>
): Promise<React.ComponentType | null> {
  if (!extension) {
    return null;
  }

  // Enforce plugin enablement check before loading
  if (!(await isPluginEnabled(extension.pluginId))) {
    return null;
  }

  const loadedModule = await extension.loadPage();
  return 'default' in loadedModule ? loadedModule.default : loadedModule;
}

async function getAdminPageMetadataCore(
  extension: AdminPageExtension | null,
  isPluginEnabled: (pluginId: string | undefined) => Promise<boolean>
): Promise<Metadata | undefined | null> {
  if (!extension) {
    return null;
  }

  // Enforce plugin enablement check before loading metadata
  if (!(await isPluginEnabled(extension.pluginId))) {
    return null;
  }

  return extension?.getMetadata ? extension.getMetadata() : undefined;
}

describe('Admin Page Enablement', () => {
  describe('Component loading', () => {
    it('should return null for disabled plugin component', async () => {
      const loadPageSpy = vi.fn();

      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'disabled-plugin',
        loadPage: loadPageSpy,
      };

      const result = await getAdminPageComponentCore(extension, async (pluginId) => {
        return pluginId !== 'disabled-plugin';
      });

      expect(result).toBe(null);
      expect(loadPageSpy).not.toHaveBeenCalled();
    });

    it('should load component for enabled plugin', async () => {
      const TestComponent = () => null;
      const loadPageSpy = vi.fn().mockResolvedValue({ default: TestComponent });

      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'enabled-plugin',
        loadPage: loadPageSpy,
      };

      const result = await getAdminPageComponentCore(extension, async (pluginId) => {
        return pluginId === 'enabled-plugin';
      });

      expect(result).toBe(TestComponent);
      expect(loadPageSpy).toHaveBeenCalledOnce();
    });

    it('should load component when no plugin specified', async () => {
      const TestComponent = () => null;
      const loadPageSpy = vi.fn().mockResolvedValue({ default: TestComponent });

      const extension: AdminPageExtension = {
        href: '/admin/settings',
        loadPage: loadPageSpy,
      };

      const result = await getAdminPageComponentCore(extension, async () => true);

      expect(result).toBe(TestComponent);
      expect(loadPageSpy).toHaveBeenCalledOnce();
    });

    it('should handle CommonJS export (no default)', async () => {
      const TestComponent = () => null;
      const loadPageSpy = vi.fn().mockResolvedValue(TestComponent);

      const extension: AdminPageExtension = {
        href: '/admin/settings',
        loadPage: loadPageSpy,
      };

      const result = await getAdminPageComponentCore(extension, async () => true);

      expect(result).toBe(TestComponent);
    });
  });

  describe('Metadata loading', () => {
    it('should return null for disabled plugin metadata', async () => {
      const getMetadataSpy = vi.fn();

      const extension: AdminPageExtension = {
        href: '/admin/settings',
        pluginId: 'disabled-plugin',
        loadPage: async () => ({ default: () => null }),
        getMetadata: getMetadataSpy,
      };

      const result = await getAdminPageMetadataCore(extension, async (pluginId) => {
        return pluginId !== 'disabled-plugin';
      });

      expect(result).toBe(null);
      expect(getMetadataSpy).not.toHaveBeenCalled();
    });

    it('should load metadata for enabled plugin', async () => {
      const metadata = { title: 'Telemetry Settings', description: 'Configure telemetry' };
      const getMetadataSpy = vi.fn().mockResolvedValue(metadata);

      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'enabled-plugin',
        loadPage: async () => ({ default: () => null }),
        getMetadata: getMetadataSpy,
      };

      const result = await getAdminPageMetadataCore(extension, async (pluginId) => {
        return pluginId === 'enabled-plugin';
      });

      expect(result).toEqual(metadata);
      expect(getMetadataSpy).toHaveBeenCalledOnce();
    });

    it('should return undefined when no getMetadata function', async () => {
      const extension: AdminPageExtension = {
        href: '/admin/settings',
        pluginId: 'enabled-plugin',
        loadPage: async () => ({ default: () => null }),
      };

      const result = await getAdminPageMetadataCore(extension, async () => true);

      expect(result).toBe(undefined);
    });

    it('should handle sync metadata function', async () => {
      const metadata = { title: 'Settings' };
      const getMetadataSpy = vi.fn().mockReturnValue(metadata);

      const extension: AdminPageExtension = {
        href: '/admin/settings',
        loadPage: async () => ({ default: () => null }),
        getMetadata: getMetadataSpy,
      };

      const result = await getAdminPageMetadataCore(extension, async () => true);

      expect(result).toEqual(metadata);
      expect(getMetadataSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Plugin enablement enforcement', () => {
    it('should check enablement before any dynamic loading', async () => {
      let isPluginEnabledCalled = false;
      const loadPageSpy = vi.fn();

      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'disabled-plugin',
        loadPage: loadPageSpy,
      };

      await getAdminPageComponentCore(extension, async (pluginId) => {
        isPluginEnabledCalled = true;
        // At this point, loadPage should not have been called yet
        expect(loadPageSpy).not.toHaveBeenCalled();
        return pluginId !== 'disabled-plugin';
      });

      expect(isPluginEnabledCalled).toBe(true);
      expect(loadPageSpy).not.toHaveBeenCalled();
    });

    it('should only load if enablement check passes', async () => {
      const TestComponent = () => null;
      const loadPageSpy = vi.fn().mockResolvedValue({ default: TestComponent });

      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'my-plugin',
        loadPage: loadPageSpy,
      };

      const isPluginEnabledSpy = vi.fn().mockResolvedValue(true);

      const result = await getAdminPageComponentCore(extension, isPluginEnabledSpy);

      expect(isPluginEnabledSpy).toHaveBeenCalledWith('my-plugin');
      expect(loadPageSpy).toHaveBeenCalledOnce();
      expect(result).toBe(TestComponent);
    });
  });

  describe('Edge cases', () => {
    it('should handle null extension', async () => {
      const result = await getAdminPageComponentCore(null, async () => true);
      expect(result).toBe(null);
    });

    it('should handle enablement function throwing', async () => {
      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'error-plugin',
        loadPage: async () => ({ default: () => null }),
      };

      const promise = getAdminPageComponentCore(extension, async () => {
        throw new Error('enablement check failed');
      });

      await expect(promise).rejects.toThrow('enablement check failed');
    });

    it('should handle loadPage function throwing', async () => {
      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        loadPage: async () => {
          throw new Error('module load failed');
        },
      };

      const promise = getAdminPageComponentCore(extension, async () => true);

      await expect(promise).rejects.toThrow('module load failed');
    });
  });
});
