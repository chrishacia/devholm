import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  validateBundledPluginRegistry,
  validateDependencyGraph,
} from '@core/lib/plugin-registry.server';
import { dispatchPublicRoute } from '@core/lib/public-route-dispatcher-core.server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import {
  CALENDAR_BASELINE_TABLES,
  CALENDAR_PLUGIN_ID,
} from '@user/extensions/plugins/calendar/constants';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { calendarPublicRouteExtension } from '@user/extensions/plugins/calendar/public-routes/calendar-public-route.server';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

function mockRequest(pathname: string) {
  return {
    method: 'GET',
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
    headers: {
      get: () => null,
      has: () => false,
    },
  } as never;
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('calendar phase 6 regression coverage', () => {
  it('keeps bundled plugin manifest + dependency graph valid and generated registry deterministic', () => {
    expect(validateBundledPluginRegistry()).toEqual([]);
    expect(validateDependencyGraph()).toEqual([]);

    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      plugins: Array<{ id: string; version: string; migrations: unknown[] }>;
    };

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      'calendar',
      'gallery',
      'url-shortener',
    ]);
    expect(registry.plugins.map((plugin) => plugin.version)).toEqual(['0.1.0', '0.1.0', '0.1.0']);
    expect(registry.plugins.find((plugin) => plugin.id === CALENDAR_PLUGIN_ID)?.migrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'calendar:20260718010000_calendar_canonical_authority',
        }),
      ])
    );
  });

  it('keeps metadata + filesystem route ownership coexistence without route claiming', async () => {
    const result = await dispatchPublicRoute('/calendar/demo', mockRequest('/calendar/demo'), {
      extensions: [calendarPublicRouteExtension],
      isPluginEnabled: async () => true,
      getReservedRoutes: () => new Set(['/api', '/admin']),
      getHelpers: async () => ({}) as ExtensionHelpers,
      createMatchContext: (reservedRoutes) => ({
        reservedRoutes,
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }),
    });

    expect(result).toEqual({ type: 'no-match' });

    const matchSpy = vi.spyOn(calendarPublicRouteExtension, 'match');

    const reservedResult = await dispatchPublicRoute(
      '/api/calendar/demo',
      mockRequest('/api/calendar/demo'),
      {
        extensions: [calendarPublicRouteExtension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(['/api', '/admin']),
        getHelpers: async () => ({}) as ExtensionHelpers,
        createMatchContext: (reservedRoutes) => ({
          reservedRoutes,
          settings: {
            get: async () => null,
            getMany: async () => ({}),
          },
        }),
      }
    );

    expect(reservedResult).toEqual({ type: 'no-match' });
    expect(matchSpy).not.toHaveBeenCalled();
    matchSpy.mockRestore();
  });

  it('keeps disable/uninstall non-destructive and purge blocked when data exists', async () => {
    const hasTable = vi.fn(async () => true);
    const del = vi.fn(async () => 0);

    const dbMock = Object.assign(
      vi.fn((tableName: string) => ({
        del,
        count: vi.fn(() => ({
          first: vi.fn(async () => ({
            row_count: tableName === CALENDAR_BASELINE_TABLES[0] ? 3 : 0,
          })),
        })),
      })),
      {
        schema: {
          hasTable,
        },
      }
    );

    vi.doMock('@/db', () => ({
      getDb: vi.fn(() => dbMock),
    }));

    const { calendarBeforeDisable, calendarBeforeUninstall, calendarPurge } = await import(
      '@user/extensions/plugins/calendar/lifecycle/hooks'
    );

    await calendarBeforeDisable();
    await calendarBeforeUninstall();
    await expect(calendarPurge()).rejects.toThrow(/Calendar purge is blocked while data exists/);

    expect(hasTable).toHaveBeenCalledTimes(CALENDAR_BASELINE_TABLES.length * 3);
    expect(del).not.toHaveBeenCalled();
  });

  it('keeps url shortener behavior unaffected by calendar phase 6 regression coverage', async () => {
    expect(calendarPluginManifest.id).toBe(CALENDAR_PLUGIN_ID);

    const match = await urlShortenerPublicRouteExtension.match(
      '/s/abc123',
      mockRequest('/s/abc123'),
      {
        reservedRoutes: new Set(['/api', '/admin']),
        settings: {
          get: async () => null,
          getMany: async () => ({}),
        },
      }
    );

    expect(match).toEqual({ code: 'abc123', prefix: '/s' });
  });
});
