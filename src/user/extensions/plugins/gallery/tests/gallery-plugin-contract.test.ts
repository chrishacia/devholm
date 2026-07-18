import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GALLERY_ARTIFACT_IDENTITY,
  GALLERY_PACKAGE_NAME,
  GALLERY_PLUGIN_ID,
  GALLERY_PUBLISHER_ID,
} from '@user/extensions/plugins/gallery/constants';
import { galleryPluginManifest } from '@user/extensions/plugins/gallery/manifest';

describe('gallery canonical package contract', () => {
  it('keeps stable plugin/package identity metadata', () => {
    expect(galleryPluginManifest.id).toBe(GALLERY_PLUGIN_ID);
    expect(galleryPluginManifest.version).toBe('0.1.0');
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

  it('keeps runtime ownership on plugin extension surfaces', () => {
    for (const permission of galleryPluginManifest.permissions ?? []) {
      expect(permission.runtimeOwner).toBe('plugin-extension');
    }
  });
});
