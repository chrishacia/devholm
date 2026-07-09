import type { DevholmBundledPlugin } from '@core/types/plugins';
import { calendarAdminPageExtensions } from '@user/extensions/plugins/calendar/admin/pages';
import { calendarApiExtensions } from '@user/extensions/plugins/calendar/api';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { calendarPublicRouteExtension } from '@user/extensions/plugins/calendar/public-routes/calendar-public-route.server';
import { calendarSettingsDefinitions } from '@user/extensions/plugins/calendar/settings/definitions';

export const calendarPlugin: DevholmBundledPlugin = {
  manifest: calendarPluginManifest,
  settings: calendarSettingsDefinitions,
  apiExtensions: calendarApiExtensions,
  publicRouteExtensions: [calendarPublicRouteExtension],
  adminPageExtensions: calendarAdminPageExtensions,
};
