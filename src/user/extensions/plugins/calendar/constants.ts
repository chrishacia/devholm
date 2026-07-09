export const CALENDAR_PLUGIN_ID = 'calendar';

export const CALENDAR_ENABLEMENT_KEY = 'plugin:calendar:enabled';

// Marks the core migration baseline this plugin expects to already exist.
export const CALENDAR_BASELINE_SCHEMA_VERSION_KEY = 'plugin:calendar:baseline-schema-version';
export const CALENDAR_BASELINE_SCHEMA_VERSION =
  'core:20260629010000_add_calendar_gallery_and_media_transforms';

export const CALENDAR_BASELINE_TABLES = [
  'calendar_collections',
  'calendar_event_types',
  'calendar_blocks',
  'calendar_bookings',
  'calendar_integrations',
] as const;

export const CALENDAR_ADMIN_PAGE_HREF = '/admin/calendar' as const;

export const CALENDAR_API_BASE_PATH = '/api/calendar' as const;
export const CALENDAR_ADMIN_API_BASE_PATH = '/api/admin/calendar' as const;

export const CALENDAR_PUBLIC_ROUTE_EXTENSION_ID = 'calendar:public-routes';

export const CALENDAR_CAPABILITY_ADMIN_MANAGEMENT = 'calendar.admin-management' as const;
export const CALENDAR_CAPABILITY_PUBLIC_VIEWING = 'calendar.public-viewing' as const;
export const CALENDAR_CAPABILITY_PUBLIC_BOOKING = 'calendar.public-booking' as const;
export const CALENDAR_CAPABILITY_EMBED_USAGE = 'calendar.embed-usage' as const;

export const CALENDAR_PERMISSION_ADMIN_MANAGE = 'plugin:calendar:admin.manage' as const;
export const CALENDAR_PERMISSION_PUBLIC_VIEW = 'plugin:calendar:public.view' as const;
export const CALENDAR_PERMISSION_PUBLIC_BOOK = 'plugin:calendar:public.book' as const;
export const CALENDAR_PERMISSION_EMBED_VIEW = 'plugin:calendar:embed.view' as const;

export const CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY_KEY =
  'plugin:calendar:lifecycle:data-retention-policy' as const;
export const CALENDAR_LIFECYCLE_UNINSTALL_POLICY_KEY =
  'plugin:calendar:lifecycle:uninstall-policy' as const;
export const CALENDAR_LIFECYCLE_PURGE_POLICY_KEY =
  'plugin:calendar:lifecycle:purge-policy' as const;

export const CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY = 'retain-all-calendar-data' as const;
export const CALENDAR_LIFECYCLE_UNINSTALL_POLICY = 'non-destructive' as const;
