import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GALLERY_ADMIN_PAGE_HREF,
  GALLERY_ARTIFACT_IDENTITY,
  GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
  GALLERY_CAPABILITY_PUBLIC_VIEWING,
  GALLERY_LIFECYCLE_DATA_RETENTION_POLICY,
  GALLERY_PACKAGE_NAME,
  GALLERY_PUBLISHER_ID,
  GALLERY_PUBLIC_ROUTE_EXTENSION_ID,
  GALLERY_PLUGIN_ID,
} from '@user/extensions/plugins/gallery/constants';
import { galleryAdminPageExtensions } from '@user/extensions/plugins/gallery/admin/pages';
import { galleryPublicRouteExtension } from '@user/extensions/plugins/gallery/public-routes/gallery-public-route.server';
import { galleryPluginManifest } from '@user/extensions/plugins/gallery/manifest';

describe('gallery canonical package contract', () => {
  it('keeps stable plugin/package identity metadata', () => {
    expect(galleryPluginManifest.id).toBe(GALLERY_PLUGIN_ID);
    expect(galleryPluginManifest.version).toBe('0.1.0');
    expect(galleryPluginManifest.devholmVersion).toBe('^3.6.0');
    expect(galleryPluginManifest.packageSource).toEqual({
      type: 'bundled',
      bundleId: GALLERY_PACKAGE_NAME,
    });
    expect(galleryPluginManifest.releaseChannel).toBe('stable');

    // Contract constants are tracked even before marketplace trust projection consumes them.
    expect(GALLERY_PUBLISHER_ID).toBe('devholm-first-party');
    expect(GALLERY_ARTIFACT_IDENTITY).toBe('bundled:gallery');
  });

  it('keeps migration ownership declarations reversible and namespaced', () => {
    const migrations = galleryPluginManifest.migrations ?? [];
    expect(migrations).toHaveLength(1);

    const migration = migrations[0];
    expect(migration.id.startsWith(`${GALLERY_PLUGIN_ID}:`)).toBe(true);
    expect('reversibility' in migration && migration.reversibility).toBe('reversible');

    const migrationPath = path.join(
      process.cwd(),
      'src/user/extensions/plugins/gallery',
      migration.file
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('keeps runtime ownership and extension declarations on plugin surfaces', () => {
    const lifecyclePolicy = galleryPluginManifest.lifecyclePolicy!;
    const lifecycleAuthorization = galleryPluginManifest.lifecycleAuthorization!;
    const migrationAuthorization = galleryPluginManifest.migrationAuthorization!;
    const adminPageExtension = galleryAdminPageExtensions[0]!;
    const publicRouteExtension = galleryPublicRouteExtension;

    expect(galleryPluginManifest.adminPageHrefs).toContain(GALLERY_ADMIN_PAGE_HREF);
    expect(galleryPluginManifest.publicRouteExtensionIds).toContain(
      GALLERY_PUBLIC_ROUTE_EXTENSION_ID
    );
    expect(lifecyclePolicy.disablePolicy).toBe('non-destructive');
    expect(lifecyclePolicy.uninstallPolicy).toBe('non-destructive');
    expect(lifecyclePolicy.dataRetention).toBe(GALLERY_LIFECYCLE_DATA_RETENTION_POLICY);
    expect(lifecyclePolicy.routeOwnershipLimitation).toContain(
      'delegate to plugin extension runtime'
    );
    expect(lifecyclePolicy.purge.destructiveDataWipe).toBe('blocked');
    expect(lifecyclePolicy.purge.blockedWhenDataPresent).toBe(true);
    expect(lifecyclePolicy.purge.requiresConfirmPluginId).toBe(true);
    expect(lifecyclePolicy.purge.warning).toContain('blocked while Gallery tables contain rows');

    for (const permission of galleryPluginManifest.permissions ?? []) {
      expect(permission.runtimeOwner).toBe('plugin-extension');
      expect(permission.capability).toMatch(/gallery\.(admin-management|public-viewing)/u);
    }

    expect(lifecycleAuthorization.capability).toBe(GALLERY_CAPABILITY_ADMIN_MANAGEMENT);
    expect(lifecycleAuthorization.permissionKeys).toContain('plugin:gallery:admin.manage');
    expect(migrationAuthorization.capability).toBe(GALLERY_CAPABILITY_ADMIN_MANAGEMENT);
    expect(migrationAuthorization.permissionKeys).toContain('plugin:gallery:admin.manage');

    expect(galleryAdminPageExtensions).toHaveLength(1);
    expect(adminPageExtension.pluginId).toBe(GALLERY_PLUGIN_ID);
    expect(adminPageExtension.href).toBe(GALLERY_ADMIN_PAGE_HREF);
    expect(adminPageExtension.accessPolicy!.capability).toBe(GALLERY_CAPABILITY_ADMIN_MANAGEMENT);
    expect(adminPageExtension.accessPolicy!.runtimeOwner).toBe('plugin-extension');

    expect(publicRouteExtension.id).toBe(GALLERY_PUBLIC_ROUTE_EXTENSION_ID);
    expect(publicRouteExtension.pluginId).toBe(GALLERY_PLUGIN_ID);
    expect(publicRouteExtension.accessPolicy!.capability).toBe(GALLERY_CAPABILITY_PUBLIC_VIEWING);
    expect(publicRouteExtension.accessPolicy!.runtimeOwner).toBe('plugin-extension');
  });
});
