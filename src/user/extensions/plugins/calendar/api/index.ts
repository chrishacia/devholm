import type { ApiExtension } from '@core/types/extensions.server';
import {
  CALENDAR_ADMIN_API_BASE_PATH,
  CALENDAR_API_BASE_PATH,
  CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
  CALENDAR_CAPABILITY_PUBLIC_BOOKING,
  CALENDAR_PERMISSION_ADMIN_MANAGE,
  CALENDAR_PERMISSION_PUBLIC_BOOK,
  CALENDAR_PERMISSION_PUBLIC_VIEW,
  CALENDAR_PLUGIN_ID,
} from '@user/extensions/plugins/calendar/constants';

// Phase 3 metadata-only registration for existing filesystem-owned Calendar APIs.
// Handlers are intentionally empty until Calendar API ownership moves off core routes.
export const calendarApiExtensions: readonly ApiExtension[] = [
  {
    pluginId: CALENDAR_PLUGIN_ID,
    path: CALENDAR_API_BASE_PATH,
    accessPolicy: {
      scope: 'policy-scoped',
      capability: CALENDAR_CAPABILITY_PUBLIC_BOOKING,
      permissionKeys: [CALENDAR_PERMISSION_PUBLIC_VIEW, CALENDAR_PERMISSION_PUBLIC_BOOK],
      runtimeOwner: 'core-filesystem',
      notes:
        'GET /api/calendar/* remains public-view scoped; POST booking creation remains policy-scoped in filesystem routes.',
    },
    handlers: {},
  },
  {
    pluginId: CALENDAR_PLUGIN_ID,
    path: CALENDAR_ADMIN_API_BASE_PATH,
    accessPolicy: {
      scope: 'admin',
      capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [CALENDAR_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'core-filesystem',
      notes:
        'Runtime admin enforcement remains verifyAdmin in existing filesystem routes for Phase 4.',
    },
    handlers: {},
  },
];
