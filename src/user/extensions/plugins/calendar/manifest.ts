import type { DevholmPluginManifest } from '@core/types/plugins';
import {
  CALENDAR_ADMIN_PAGE_HREF,
  CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
  CALENDAR_CAPABILITY_EMBED_USAGE,
  CALENDAR_CAPABILITY_PUBLIC_BOOKING,
  CALENDAR_CAPABILITY_PUBLIC_VIEWING,
  CALENDAR_ENABLEMENT_KEY,
  CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY,
  CALENDAR_PACKAGE_NAME,
  CALENDAR_PERMISSION_ADMIN_MANAGE,
  CALENDAR_PERMISSION_EMBED_VIEW,
  CALENDAR_PERMISSION_PUBLIC_BOOK,
  CALENDAR_PERMISSION_PUBLIC_VIEW,
  CALENDAR_PLUGIN_ID,
  CALENDAR_PUBLIC_ROUTE_EXTENSION_ID,
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
  packageSource: {
    type: 'bundled',
    bundleId: CALENDAR_PACKAGE_NAME,
  },
  releaseChannel: 'stable',
  permissions: [
    {
      key: CALENDAR_PERMISSION_ADMIN_MANAGE,
      capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
      scope: 'admin',
      description:
        'Manage Calendar collections, scheduling blocks, and event types via admin APIs.',
      runtimeOwner: 'plugin-extension',
    },
    {
      key: CALENDAR_PERMISSION_PUBLIC_VIEW,
      capability: CALENDAR_CAPABILITY_PUBLIC_VIEWING,
      scope: 'public',
      description: 'View public Calendar collection and event-type availability surfaces.',
      runtimeOwner: 'plugin-extension',
    },
    {
      key: CALENDAR_PERMISSION_PUBLIC_BOOK,
      capability: CALENDAR_CAPABILITY_PUBLIC_BOOKING,
      scope: 'public',
      description: 'Create public booking requests for booking-enabled Calendar collections.',
      runtimeOwner: 'plugin-extension',
    },
    {
      key: CALENDAR_PERMISSION_EMBED_VIEW,
      capability: CALENDAR_CAPABILITY_EMBED_USAGE,
      scope: 'future',
      description:
        'Future embed rendering policy for Calendar shortcodes once bundled contract exists.',
      runtimeOwner: 'core-filesystem',
    },
  ],
  lifecycleAuthorization: {
    capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
    permissionKeys: [CALENDAR_PERMISSION_ADMIN_MANAGE],
  },
  migrationAuthorization: {
    capability: CALENDAR_CAPABILITY_ADMIN_MANAGEMENT,
    permissionKeys: [CALENDAR_PERMISSION_ADMIN_MANAGE],
  },
  settings: calendarSettingsDefinitions,
  lifecyclePolicy: {
    baselineAdoptionNote:
      'Calendar plugin adopts shared core migration baseline (20260629010000) without rerunning or copying schema migration history.',
    disablePolicy: 'non-destructive',
    uninstallPolicy: 'non-destructive',
    dataRetention: CALENDAR_LIFECYCLE_DATA_RETENTION_POLICY,
    routeOwnershipLimitation:
      'Existing filesystem Calendar routes remain runtime owners until direct core registrations are removed in Phase 7.',
    purge: {
      requiresConfirmPluginId: true,
      destructiveDataWipe: 'blocked',
      blockedWhenDataPresent: true,
      warning:
        'Purge is safety-gated and blocked while Calendar tables contain rows; disable/uninstall preserve schema and data.',
    },
  },
  adminPageHrefs: [CALENDAR_ADMIN_PAGE_HREF],
  publicRouteExtensionIds: [CALENDAR_PUBLIC_ROUTE_EXTENSION_ID],
  migrations: [
    {
      id: 'calendar:20260718010000_calendar_canonical_authority',
      file: 'db/migrations/20260718010000_calendar_canonical_authority.ts',
      reversibility: 'reversible',
      description: 'Adopt canonical package migration authority for existing Calendar baseline.',
    },
  ],
  seeds: [],
  lifecycle: {
    afterInstall: calendarAfterInstall,
    afterUpgrade: calendarAfterUpgrade,
    beforeDisable: calendarBeforeDisable,
    beforeUninstall: calendarBeforeUninstall,
    purge: calendarPurge,
  },
};
