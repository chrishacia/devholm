import type { DevholmBundledPlugin } from '@core/types/plugins';
import { calendarPluginManifest } from '@user/extensions/plugins/calendar/manifest';
import { calendarSettingsDefinitions } from '@user/extensions/plugins/calendar/settings/definitions';

export const calendarPlugin: DevholmBundledPlugin = {
  manifest: calendarPluginManifest,
  settings: calendarSettingsDefinitions,
};
