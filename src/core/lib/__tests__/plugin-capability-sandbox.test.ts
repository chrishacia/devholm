import { describe, expect, it } from 'vitest';
import {
  evaluatePluginSandboxAccess,
  getPluginSandboxCapabilityRegistry,
} from '@core/lib/plugin-capability-sandbox.server';
import { urlShortenerApiExtensions } from '@user/extensions/plugins/url-shortener/api';

describe('plugin capability sandbox enforcement', () => {
  it('exposes an authoritative capability registry', () => {
    const registry = getPluginSandboxCapabilityRegistry();
    const ids = registry.map((entry) => entry.id);

    expect(ids).toContain('calendar.admin-management');
    expect(ids).toContain('gallery.public-viewing');
    expect(ids).toContain('url-shortener.admin-management');
  });

  it('allows declared url-shortener admin API capability', async () => {
    const extension = urlShortenerApiExtensions[0];
    const decision = await evaluatePluginSandboxAccess({
      pluginId: extension.pluginId,
      surface: 'api-route',
      resourceId: extension.path,
      accessPolicy: extension.accessPolicy,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.capability).toBe('url-shortener.admin-management');
    expect(decision.deniedPermissionKeys).toEqual([]);
  });

  it('denies plugin execution when access policy is missing', async () => {
    const decision = await evaluatePluginSandboxAccess({
      pluginId: 'url-shortener',
      surface: 'api-route',
      resourceId: '/api/url-shortener',
      accessPolicy: undefined,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('sandbox policy missing');
  });

  it('denies unknown capability identifiers', async () => {
    const decision = await evaluatePluginSandboxAccess({
      pluginId: 'url-shortener',
      surface: 'api-route',
      resourceId: '/api/url-shortener',
      accessPolicy: {
        scope: 'admin',
        capability: 'url-shortener.unknown-capability',
        permissionKeys: ['plugin:url-shortener:admin.manage'],
        runtimeOwner: 'plugin-extension',
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('unknown sandbox capability');
  });

  it('denies mismatched permission declarations', async () => {
    const decision = await evaluatePluginSandboxAccess({
      pluginId: 'url-shortener',
      surface: 'api-route',
      resourceId: '/api/url-shortener',
      accessPolicy: {
        scope: 'admin',
        capability: 'url-shortener.admin-management',
        permissionKeys: ['plugin:url-shortener:not-declared'],
        runtimeOwner: 'plugin-extension',
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('permission declarations do not authorize');
    expect(decision.deniedPermissionKeys).toEqual(['plugin:url-shortener:not-declared']);
  });

  it('denies policy-scoped capability without explicit approval', async () => {
    const decision = await evaluatePluginSandboxAccess({
      pluginId: 'calendar',
      surface: 'api-route',
      resourceId: '/api/calendar',
      accessPolicy: {
        scope: 'policy-scoped',
        capability: 'calendar.public-booking',
        permissionKeys: ['plugin:calendar:public.book'],
        runtimeOwner: 'core-filesystem',
      },
      loadCapabilityApproval: async () => false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('explicit approval missing');
  });
});
