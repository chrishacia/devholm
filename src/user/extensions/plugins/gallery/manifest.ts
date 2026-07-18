import type { DevholmPluginManifest } from '@core/types/plugins';
import {
  GALLERY_ADMIN_PAGE_HREF,
  GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
  GALLERY_CAPABILITY_PUBLIC_VIEWING,
  GALLERY_ENABLEMENT_KEY,
  GALLERY_LIFECYCLE_DATA_RETENTION_POLICY,
  GALLERY_PACKAGE_NAME,
  GALLERY_PERMISSION_ADMIN_MANAGE,
  GALLERY_PERMISSION_PUBLIC_VIEW,
  GALLERY_PLUGIN_ID,
  GALLERY_PUBLIC_ROUTE_EXTENSION_ID,
} from '@user/extensions/plugins/gallery/constants';
import {
  galleryAfterInstall,
  galleryAfterUpgrade,
  galleryBeforeDisable,
  galleryBeforeUninstall,
  galleryPurge,
} from '@user/extensions/plugins/gallery/lifecycle/hooks';
import { gallerySettingsDefinitions } from '@user/extensions/plugins/gallery/settings/definitions';

export const galleryPluginManifest: DevholmPluginManifest = {
  id: GALLERY_PLUGIN_ID,
  name: 'Gallery',
  description: 'Lifecycle-managed ownership boundary for Gallery surfaces and media references.',
  version: '0.1.0',
  devholmVersion: '^3.6.0',
  enablementSettingKey: GALLERY_ENABLEMENT_KEY,
  dependencies: {
    plugins: {},
    packages: {},
  },
  packageSource: {
    type: 'bundled',
    bundleId: GALLERY_PACKAGE_NAME,
  },
  releaseChannel: 'stable',
  permissions: [
    {
      key: GALLERY_PERMISSION_ADMIN_MANAGE,
      capability: GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
      scope: 'admin',
      description: 'Manage Gallery collections, items, and ordering via admin APIs.',
      runtimeOwner: 'plugin-extension',
    },
    {
      key: GALLERY_PERMISSION_PUBLIC_VIEW,
      capability: GALLERY_CAPABILITY_PUBLIC_VIEWING,
      scope: 'public',
      description: 'View public Gallery collection pages and related API responses.',
      runtimeOwner: 'plugin-extension',
    },
  ],
  lifecycleAuthorization: {
    capability: GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
    permissionKeys: [GALLERY_PERMISSION_ADMIN_MANAGE],
  },
  migrationAuthorization: {
    capability: GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
    permissionKeys: [GALLERY_PERMISSION_ADMIN_MANAGE],
  },
  settings: gallerySettingsDefinitions,
  lifecyclePolicy: {
    baselineAdoptionNote:
      'Gallery plugin adopts shared core migration baseline (20260629010000) without rerunning or copying schema migration history.',
    disablePolicy: 'non-destructive',
    uninstallPolicy: 'non-destructive',
    dataRetention: GALLERY_LIFECYCLE_DATA_RETENTION_POLICY,
    routeOwnershipLimitation: 'Filesystem Gallery routes delegate to plugin extension runtime.',
    purge: {
      requiresConfirmPluginId: true,
      destructiveDataWipe: 'blocked',
      blockedWhenDataPresent: true,
      warning:
        'Purge is safety-gated and blocked while Gallery tables contain rows or media references; disable/uninstall preserve schema and data.',
    },
  },
  adminPageHrefs: [GALLERY_ADMIN_PAGE_HREF],
  publicRouteExtensionIds: [GALLERY_PUBLIC_ROUTE_EXTENSION_ID],
  migrations: [
    {
      id: 'gallery:20260718020000_gallery_canonical_authority',
      file: 'db/migrations/20260718020000_gallery_canonical_authority.ts',
      reversibility: 'reversible',
      description: 'Adopt canonical package migration authority for existing Gallery baseline.',
    },
  ],
  seeds: [],
  lifecycle: {
    afterInstall: galleryAfterInstall,
    afterUpgrade: galleryAfterUpgrade,
    beforeDisable: galleryBeforeDisable,
    beforeUninstall: galleryBeforeUninstall,
    purge: galleryPurge,
  },
};
