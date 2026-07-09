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
