import type { PluginSettingsDefinition } from '@core/types/plugins';
import {
  CALENDAR_BASELINE_SCHEMA_VERSION,
  CALENDAR_BASELINE_SCHEMA_VERSION_KEY,
  CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY,
  CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY_KEY,
  CALENDAR_LIFECYCLE_PURGE_POLICY_KEY,
  CALENDAR_LIFECYCLE_UNINSTALL_POLICY,
  CALENDAR_LIFECYCLE_UNINSTALL_POLICY_KEY,
} from '@user/extensions/plugins/calendar/constants';

export const calendarSettingsDefinitions: readonly PluginSettingsDefinition[] = [
  {
    key: CALENDAR_BASELINE_SCHEMA_VERSION_KEY,
    type: 'string',
    defaultValue: CALENDAR_BASELINE_SCHEMA_VERSION,
    category: 'plugins',
    description: 'Calendar schema baseline adopted from existing core migration state',
  },
  {
    key: CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY_KEY,
    type: 'string',
    defaultValue: CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY,
    category: 'plugins',
    description: 'Calendar lifecycle retention policy for disable/uninstall operations',
  },
  {
    key: CALENDAR_LIFECYCLE_UNINSTALL_POLICY_KEY,
    type: 'string',
    defaultValue: CALENDAR_LIFECYCLE_UNINSTALL_POLICY,
    category: 'plugins',
    description: 'Calendar uninstall policy remains non-destructive and preserves all data',
  },
  {
    key: CALENDAR_LIFECYCLE_PURGE_POLICY_KEY,
    type: 'json',
    defaultValue: {
      requiresConfirmPluginId: true,
      blockedWhenDataPresent: true,
      destructiveDataWipe: 'blocked',
      warning:
        'Calendar purge is safety-gated and blocked while Calendar tables contain rows. Disable/uninstall remain non-destructive.',
    },
    category: 'plugins',
    description: 'Calendar purge safety contract and confirmation expectations',
  },
];
