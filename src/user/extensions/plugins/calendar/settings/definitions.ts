import type { PluginSettingsDefinition } from '@core/types/plugins';
import {
  CALENDAR_BASELINE_SCHEMA_VERSION,
  CALENDAR_BASELINE_SCHEMA_VERSION_KEY,
} from '@user/extensions/plugins/calendar/constants';

export const calendarSettingsDefinitions: readonly PluginSettingsDefinition[] = [
  {
    key: CALENDAR_BASELINE_SCHEMA_VERSION_KEY,
    type: 'string',
    defaultValue: CALENDAR_BASELINE_SCHEMA_VERSION,
    category: 'plugins',
    description: 'Calendar schema baseline adopted from existing core migration state',
  },
];
