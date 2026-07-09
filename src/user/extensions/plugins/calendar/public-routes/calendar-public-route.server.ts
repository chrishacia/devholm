import type { PublicRouteExtension } from '@core/types/extensions.server';
import {
  CALENDAR_PLUGIN_ID,
  CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
} from '@user/extensions/plugins/calendar/constants';

// Phase 3 metadata-only declaration.
// Calendar public route ownership remains filesystem + reserved-route based for now.
// This extension intentionally does not claim any route until Phase 7 route ownership changes.
export const calendarPublicRouteExtension: PublicRouteExtension<never> = {
  pluginId: CALENDAR_PLUGIN_ID,
  id: CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
  match: async () => null,
  handle: async () => new Response(null, { status: 404 }),
};
