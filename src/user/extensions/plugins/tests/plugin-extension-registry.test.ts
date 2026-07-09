import { describe, expect, it } from 'vitest';
import { adminPageExtensions } from '@user/extensions/admin/pages';
import { apiExtensions } from '@user/extensions/api';
import { publicRouteExtensions } from '@user/extensions/public-routes';
import {
  CALENDAR_ADMIN_API_BASE_PATH,
  CALENDAR_ADMIN_PAGE_HREF,
  CALENDAR_API_BASE_PATH,
  CALENDAR_PLUGIN_ID,
  CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
} from '@user/extensions/plugins/calendar/constants';

describe('plugin extension registries include calendar metadata adapters', () => {
  it('includes calendar admin page metadata in admin extension registry', () => {
    const calendarAdminPages = adminPageExtensions.filter(
      (item) => item.pluginId === CALENDAR_PLUGIN_ID
    );

    expect(calendarAdminPages.map((item) => item.href)).toContain(CALENDAR_ADMIN_PAGE_HREF);
  });

  it('includes calendar API metadata in api extension registry', () => {
    const calendarApiPaths = apiExtensions
      .filter((item) => item.pluginId === CALENDAR_PLUGIN_ID)
      .map((item) => item.path);

    expect(calendarApiPaths).toEqual(
      expect.arrayContaining([CALENDAR_API_BASE_PATH, CALENDAR_ADMIN_API_BASE_PATH])
    );
  });

  it('includes calendar public route metadata in public route registry', () => {
    const calendarRoute = publicRouteExtensions.find(
      (item) => item.id === CALENDAR_PUBLIC_ROUTE_EXTENSION_ID
    );

    expect(calendarRoute?.pluginId).toBe(CALENDAR_PLUGIN_ID);
  });
});
