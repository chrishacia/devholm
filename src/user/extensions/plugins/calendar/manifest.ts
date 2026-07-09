import type { DevholmPluginManifest } from '@core/types/plugins';
import {
  CALENDAR_ENABLEMENT_KEY,
  CALENDAR_PLUGIN_ID,
} from '@user/extensions/plugins/calendar/constants';
import {
  calendarAfterInstall,
  calendarAfterUpgrade,
  calendarBeforeDisable,
  calendarBeforeUninstall,
  calendarPurge,
} from '@user/extensions/plugins/calendar/lifecycle/hooks';
import { calendarSettingsDefinitions } from '@user/extensions/plugins/calendar/settings/definitions';

export const calendarPluginManifest: DevholmPluginManifest = {
  id: CALENDAR_PLUGIN_ID,
  name: 'Calendar',
  description: 'Lifecycle-managed ownership boundary for Calendar surfaces and data.',
  version: '0.1.0',
  devholmVersion: '^3.6.0',
  enablementSettingKey: CALENDAR_ENABLEMENT_KEY,
  dependencies: {
    plugins: {},
    packages: {},
  },
  settings: calendarSettingsDefinitions,
  adminPageHrefs: ['/admin/calendar'],
  migrations: [],
  seeds: [],
  lifecycle: {
    afterInstall: calendarAfterInstall,
    afterUpgrade: calendarAfterUpgrade,
    beforeDisable: calendarBeforeDisable,
    beforeUninstall: calendarBeforeUninstall,
    purge: calendarPurge,
  },
};
