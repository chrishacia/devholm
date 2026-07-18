import type { Metadata } from 'next';
import type { AdminPageExtension } from '@core/types/extensions.server';
import {
  CALENDAR_ADMIN_PAGE_HREF,
  CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
  CALENDAR_PERMISSION_ADMIN_MANAGE,
  CALENDAR_PLUGIN_ID,
} from '@user/extensions/plugins/calendar/constants';

function createCalendarAdminPageExtension(): AdminPageExtension {
  return {
    pluginId: CALENDAR_PLUGIN_ID,
    href: CALENDAR_ADMIN_PAGE_HREF,
    accessPolicy: {
      scope: 'admin',
      capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [CALENDAR_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'plugin-extension',
      notes: 'Calendar admin surface ownership is declared through plugin extension metadata.',
    },
    loadPage: async () => import('@/app/admin/calendar/page'),
    getMetadata: async (): Promise<Metadata> => ({
      title: 'Calendar Plugin',
      description: 'Manage Calendar collections, booking modes, and publishing options.',
    }),
  };
}

export const calendarAdminPageExtensions: readonly AdminPageExtension[] = [
  createCalendarAdminPageExtension(),
];
