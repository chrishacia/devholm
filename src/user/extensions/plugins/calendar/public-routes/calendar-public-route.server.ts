import type { PublicRouteExtension } from '@core/types/extensions.server';
import {
  CALENDAR_CAPABILITY_PUBLIC_VIEWING,
  CALENDAR_PERMISSION_PUBLIC_VIEW,
  CALENDAR_PLUGIN_ID,
  CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
} from '@user/extensions/plugins/calendar/constants';

// Phase 3 metadata-only declaration.
// Calendar public route ownership remains filesystem + reserved-route based for now.
// This extension intentionally does not claim any route until Phase 7 route ownership changes.
export const calendarPublicRouteExtension: PublicRouteExtension<never> = {
  pluginId: CALENDAR_PLUGIN_ID,
  id: CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
  accessPolicy: {
    scope: 'public',
    capability: CALENDAR_CAPABILITY_PUBLIC_VIEWING,
    permissionKeys: [CALENDAR_PERMISSION_PUBLIC_VIEW],
    runtimeOwner: 'plugin-extension',
    notes:
      'Metadata-owned by plugin extension; this adapter remains intentionally non-claiming while /calendar filesystem routes are retired safely.',
  },
  match: async () => null,
  handle: async () => new Response(null, { status: 404 }),
};
