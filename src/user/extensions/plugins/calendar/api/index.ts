import type { ApiExtension } from '@core/types/extensions.server';
import {
  CALENDAR_ADMIN_API_BASE_PATH,
  CALENDAR_API_BASE_PATH,
  CALENDAR_PLUGIN_ID,
} from '@user/extensions/plugins/calendar/constants';

// Phase 3 metadata-only registration for existing filesystem-owned Calendar APIs.
// Handlers are intentionally empty until Calendar API ownership moves off core routes.
export const calendarApiExtensions: readonly ApiExtension[] = [
  {
    pluginId: CALENDAR_PLUGIN_ID,
    path: CALENDAR_API_BASE_PATH,
    handlers: {},
  },
  {
    pluginId: CALENDAR_PLUGIN_ID,
    path: CALENDAR_ADMIN_API_BASE_PATH,
    handlers: {},
  },
];
