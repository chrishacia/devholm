import { describe, expect, it } from 'vitest';
import { apiExtensions } from '@user/extensions/api';
import { bundledPlugins } from '@user/extensions/plugins/registry';
import {
  CALENDAR_ADMIN_API_BASE_PATH,
  CALENDAR_ADMIN_PAGE_HREF,
  CALENDAR_API_BASE_PATH,
  CALENDAR_PLUGIN_ID,
  CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
} from '@user/extensions/plugins/calendar/constants';
import { calendarPublicRouteExtension } from '@user/extensions/plugins/calendar/public-routes/calendar-public-route.server';

describe('calendar phase 3 registration metadata', () => {
  it('registers calendar in bundled plugin registry with metadata adapters', () => {
    const plugin = bundledPlugins.find((item) => item.manifest.id === CALENDAR_PLUGIN_ID);

    expect(plugin).toBeDefined();
    expect(plugin?.adminPageExtensions?.map((item) => item.href)).toContain(
      CALENDAR_ADMIN_PAGE_HREF
    );
    expect(plugin?.apiExtensions?.map((item) => item.path)).toEqual(
      expect.arrayContaining([CALENDAR_API_BASE_PATH, CALENDAR_ADMIN_API_BASE_PATH])
    );
    expect(plugin?.publicRouteExtensions?.map((item) => item.id)).toContain(
      CALENDAR_PUBLIC_ROUTE_EXTENSION_ID
    );
    expect(plugin?.manifest.publicRouteExtensionIds).toEqual([CALENDAR_PUBLIC_ROUTE_EXTENSION_ID]);
  });

  it('registers calendar API namespace metadata in the extension registry', () => {
    const paths = apiExtensions
      .filter((item) => item.pluginId === CALENDAR_PLUGIN_ID)
      .map((item) => item.path);

    expect(paths).toEqual(
      expect.arrayContaining([CALENDAR_API_BASE_PATH, CALENDAR_ADMIN_API_BASE_PATH])
    );
  });

  it('keeps calendar public route adapter metadata without claiming paths yet', async () => {
    expect(calendarPublicRouteExtension.id).toBe(CALENDAR_PUBLIC_ROUTE_EXTENSION_ID);
    expect(calendarPublicRouteExtension.pluginId).toBe(CALENDAR_PLUGIN_ID);
    const result = await calendarPublicRouteExtension.match('/calendar/demo', {} as never, {
      reservedRoutes: new Set(),
      settings: {
        get: async () => null,
        getMany: async () => ({}),
      },
    });

    expect(result).toBeNull();
  });
});
