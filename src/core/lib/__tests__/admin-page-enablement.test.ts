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
});
