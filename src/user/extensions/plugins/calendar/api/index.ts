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
import {
  handleCalendarAdminApi,
  handleCalendarPublicApi,
} from '@user/extensions/plugins/calendar/api/handlers';

export const calendarApiExtensions: readonly ApiExtension[] = [
  {
    pluginId: CALENDAR_PLUGIN_ID,
    path: CALENDAR_API_BASE_PATH,
    accessPolicy: {
      scope: 'public',
      capability: CALENDAR_CAPABILITY_PUBLIC_BOOKING,
      permissionKeys: [CALENDAR_PERMISSION_PUBLIC_VIEW, CALENDAR_PERMISSION_PUBLIC_BOOK],
      runtimeOwner: 'plugin-extension',
      notes: 'Calendar public API runtime now executes in plugin extension module context.',
    },
    handlers: {
      GET: async (_request, context) => {
        return handleCalendarPublicApi('GET', _request, context.params.path.slice(1));
      },
      POST: async (_request, context) => {
        return handleCalendarPublicApi('POST', _request, context.params.path.slice(1));
      },
    },
  },
  {
    pluginId: CALENDAR_PLUGIN_ID,
    path: CALENDAR_ADMIN_API_BASE_PATH,
    accessPolicy: {
      scope: 'admin',
      capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [CALENDAR_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'plugin-extension',
      notes: 'Calendar admin API runtime now executes in plugin extension module context.',
    },
    handlers: {
      GET: async (_request, context) => {
        return handleCalendarAdminApi('GET', _request, context.params.path.slice(2));
      },
      POST: async (_request, context) => {
        return handleCalendarAdminApi('POST', _request, context.params.path.slice(2));
      },
      PUT: async (_request, context) => {
        return handleCalendarAdminApi('PUT', _request, context.params.path.slice(2));
      },
      PATCH: async (_request, context) => {
        return handleCalendarAdminApi('PATCH', _request, context.params.path.slice(2));
      },
      DELETE: async (_request, context) => {
        return handleCalendarAdminApi('DELETE', _request, context.params.path.slice(2));
      },
    },
  },
];
