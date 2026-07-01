/**
 * Tests for admin page enablement helpers
 *
 * Verify that admin pages are only loaded if enabled, and that enablement
 * is checked before dynamic imports
 */

import { describe, it, expect, vi } from 'vitest';
import type { AdminPageExtension } from '@core/types/extensions.server';
import {
  loadEnabledAdminPageComponent,
  loadEnabledAdminPageMetadata,
} from '@core/lib/admin-page-enablement.server';

describe('Admin Page Enablement Helpers', () => {
  describe('loadEnabledAdminPageComponent', () => {
    it('should load component for enabled plugin', async () => {
      const loadPage = vi.fn(async () => ({ default: () => 'Component' }));
      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'enabled-plugin',
        loadPage,
        getMetadata: async () => ({ title: 'Telemetry' }),
      };

      const isPluginEnabled = vi.fn(async () => true);

      const component = await loadEnabledAdminPageComponent(extension, isPluginEnabled);

      expect(component).not.toBeNull();
      expect(isPluginEnabled).toHaveBeenCalledWith('enabled-plugin');
      expect(loadPage).toHaveBeenCalled();
    });

    it('should not load component for disabled plugin', async () => {
      const loadPage = vi.fn(async () => ({ default: () => 'Component' }));
      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'disabled-plugin',
        loadPage,
        getMetadata: async () => ({ title: 'Telemetry' }),
      };

      const isPluginEnabled = vi.fn(async () => false);

      const component = await loadEnabledAdminPageComponent(extension, isPluginEnabled);

      expect(component).toBeNull();
      expect(isPluginEnabled).toHaveBeenCalledWith('disabled-plugin');
      expect(loadPage).not.toHaveBeenCalled();
    });

    it('should load core pages (no pluginId) without enablement check', async () => {
      const loadPage = vi.fn(async () => ({ default: () => 'Component' }));
      const extension: AdminPageExtension = {
        href: '/admin/settings',
        loadPage,
        getMetadata: async () => ({ title: 'Settings' }),
      };

      const isPluginEnabled = vi.fn();

      const component = await loadEnabledAdminPageComponent(extension, isPluginEnabled);

      expect(component).not.toBeNull();
      expect(isPluginEnabled).not.toHaveBeenCalled();
      expect(loadPage).toHaveBeenCalled();
    });

    it('should check enablement before calling loadPage', async () => {
      const loadPage = vi.fn(async () => ({ default: () => 'Component' }));
      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'test-plugin',
        loadPage,
        getMetadata: async () => ({ title: 'Test' }),
      };

      const isPluginEnabled = vi.fn(async () => false);

      await loadEnabledAdminPageComponent(extension, isPluginEnabled);

      // enablement should be called, and loadPage should not
      expect(isPluginEnabled).toHaveBeenCalled();
      expect(loadPage).not.toHaveBeenCalled();
    });
  });

  describe('loadEnabledAdminPageMetadata', () => {
    it('should load metadata for enabled plugin', async () => {
      const getMetadata = vi.fn(async () => ({ title: 'Telemetry' }));
      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'enabled-plugin',
        loadPage: async () => ({ default: () => 'Component' }),
        getMetadata,
      };

      const isPluginEnabled = vi.fn(async () => true);

      const metadata = await loadEnabledAdminPageMetadata(extension, isPluginEnabled);

      expect(metadata).toEqual({ title: 'Telemetry' });
      expect(isPluginEnabled).toHaveBeenCalledWith('enabled-plugin');
      expect(getMetadata).toHaveBeenCalled();
    });

    it('should not load metadata for disabled plugin', async () => {
      const getMetadata = vi.fn(async () => ({ title: 'Telemetry' }));
      const extension: AdminPageExtension = {
        href: '/admin/telemetry',
        pluginId: 'disabled-plugin',
        loadPage: async () => ({ default: () => 'Component' }),
        getMetadata,
      };

      const isPluginEnabled = vi.fn(async () => false);

      const metadata = await loadEnabledAdminPageMetadata(extension, isPluginEnabled);

      expect(metadata).toBeUndefined();
      expect(isPluginEnabled).toHaveBeenCalledWith('disabled-plugin');
      expect(getMetadata).not.toHaveBeenCalled();
    });

    it('should load core page metadata (no pluginId) without enablement check', async () => {
      const getMetadata = vi.fn(async () => ({ title: 'Settings' }));
      const extension: AdminPageExtension = {
        href: '/admin/settings',
        loadPage: async () => ({ default: () => 'Component' }),
        getMetadata,
      };

      const isPluginEnabled = vi.fn();

      const metadata = await loadEnabledAdminPageMetadata(extension, isPluginEnabled);

      expect(metadata).toEqual({ title: 'Settings' });
      expect(isPluginEnabled).not.toHaveBeenCalled();
      expect(getMetadata).toHaveBeenCalled();
    });

    it('should check enablement before calling getMetadata', async () => {
      const getMetadata = vi.fn(async () => ({ title: 'Test' }));
      const extension: AdminPageExtension = {
        href: '/admin/test',
        pluginId: 'test-plugin',
        loadPage: async () => ({ default: () => 'Component' }),
        getMetadata,
      };

      const isPluginEnabled = vi.fn(async () => false);

      await loadEnabledAdminPageMetadata(extension, isPluginEnabled);

      // enablement should be called, getMetadata should not
      expect(isPluginEnabled).toHaveBeenCalled();
      expect(getMetadata).not.toHaveBeenCalled();
    });
  });

  describe('Production resolver delegation', () => {
    async function importResolverWithMocks(
      extension: AdminPageExtension,
      enabled: boolean
    ): Promise<{
      getAdminPageComponent: (
        slug: string[]
      ) => Promise<(() => string) | null | React.ComponentType>;
      getAdminPageMetadata: (slug: string[]) => Promise<{ title: string } | undefined>;
      isPluginEnabledSpy: ReturnType<typeof vi.fn>;
    }> {
      vi.resetModules();

      const isPluginEnabledSpy = vi.fn(async () => enabled);

      vi.doMock('@user/extensions/admin/pages', () => ({
        adminPageExtensions: [extension],
      }));
      vi.doMock('@user/extensions/api', () => ({
        apiExtensions: [],
      }));
      vi.doMock('@user/extensions/seo', () => ({
        metadataExtensions: [],
        robotsExtensions: [],
        sitemapExtensions: [],
        structuredDataExtensions: [],
      }));
      vi.doMock('@/db/plugins', () => ({
        isPluginEnabled: isPluginEnabledSpy,
      }));
      vi.doMock('@core/lib/extension-helpers.server', () => ({
        getExtensionHelpers: vi.fn(() => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        })),
      }));

      const { getAdminPageComponent, getAdminPageMetadata } = await import(
        '@core/lib/extensions.server'
      );

      return {
        getAdminPageComponent,
        getAdminPageMetadata,
        isPluginEnabledSpy,
      };
    }

    it('should not call loadPage for a disabled plugin via production resolver', async () => {
      const loadPage = vi.fn(async () => ({ default: () => 'Component' }));
      const getMetadata = vi.fn(async () => ({ title: 'Test' }));

      const { getAdminPageComponent, isPluginEnabledSpy } = await importResolverWithMocks(
        {
          href: '/admin/test',
          pluginId: 'disabled-plugin',
          loadPage,
          getMetadata,
        },
        false
      );

      const component = await getAdminPageComponent(['test']);

      expect(component).toBeNull();
      expect(isPluginEnabledSpy).toHaveBeenCalledWith('disabled-plugin');
      expect(loadPage).not.toHaveBeenCalled();
    });

    it('should not call getMetadata for a disabled plugin via production resolver', async () => {
      const loadPage = vi.fn(async () => ({ default: () => 'Component' }));
      const getMetadata = vi.fn(async () => ({ title: 'Test' }));

      const { getAdminPageMetadata, isPluginEnabledSpy } = await importResolverWithMocks(
        {
          href: '/admin/test',
          pluginId: 'disabled-plugin',
          loadPage,
          getMetadata,
        },
        false
      );

      const metadata = await getAdminPageMetadata(['test']);

      expect(metadata).toBeUndefined();
      expect(isPluginEnabledSpy).toHaveBeenCalledWith('disabled-plugin');
      expect(getMetadata).not.toHaveBeenCalled();
    });

    it('should call loadPage and return component for an enabled plugin via production resolver', async () => {
      const component = () => 'Component';
      const loadPage = vi.fn(async () => ({ default: component }));
      const getMetadata = vi.fn(async () => ({ title: 'Test' }));

      const { getAdminPageComponent, isPluginEnabledSpy } = await importResolverWithMocks(
        {
          href: '/admin/test',
          pluginId: 'enabled-plugin',
          loadPage,
          getMetadata,
        },
        true
      );

      const resolvedComponent = await getAdminPageComponent(['test']);

      expect(resolvedComponent).toBe(component);
      expect(isPluginEnabledSpy).toHaveBeenCalledWith('enabled-plugin');
      expect(loadPage).toHaveBeenCalledTimes(1);
    });

    it('should call getMetadata and return metadata for an enabled plugin via production resolver', async () => {
      const expectedMetadata = { title: 'Enabled Test' };
      const loadPage = vi.fn(async () => ({ default: () => 'Component' }));
      const getMetadata = vi.fn(async () => expectedMetadata);

      const { getAdminPageMetadata, isPluginEnabledSpy } = await importResolverWithMocks(
        {
          href: '/admin/test',
          pluginId: 'enabled-plugin',
          loadPage,
          getMetadata,
        },
        true
      );

      const metadata = await getAdminPageMetadata(['test']);

      expect(metadata).toEqual(expectedMetadata);
      expect(isPluginEnabledSpy).toHaveBeenCalledWith('enabled-plugin');
      expect(getMetadata).toHaveBeenCalledTimes(1);
    });
  });
});
