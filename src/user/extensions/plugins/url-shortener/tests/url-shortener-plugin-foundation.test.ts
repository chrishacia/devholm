import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { getPluginLock, lockPluginVersion } from '@core/db/plugin-versioning';
import { performSafePluginUpdate } from '@core/lib/plugin-safe-activation.server';
import { resolvePublicRouteExtension } from '@core/lib/public-route-dispatcher.server';
import { bundledPlugins } from '@user/extensions/plugins/registry';
import {
  createUrlShortenerLink,
  getUrlShortenerLinkByCode,
  getUrlShortenerOverview,
  getUrlShortenerSettings,
  recordUrlShortenerClick,
  updateUrlShortenerSettings,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';
import {
  down as teardownUrlShortenerSchema,
  up as setupUrlShortenerSchema,
} from '@user/extensions/plugins/url-shortener/db/migrations/20260701010000_url_shortener_foundation';
import {
  URL_SHORTENER_ALLOWED_CREATION_MODES,
  URL_SHORTENER_DEFAULT_PREFIX,
  URL_SHORTENER_ENABLEMENT_KEY,
  URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
  URL_SHORTENER_PLUGIN_ID,
  URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
  URL_SHORTENER_ROUTE_PREFIX_KEY,
} from '@user/extensions/plugins/url-shortener/constants';
import { urlShortenerPluginManifest } from '@user/extensions/plugins/url-shortener/manifest';
import {
  createShortLinkInputSchema,
  destinationUrlSchema,
  publicCreationModeSchema,
  shortCodeSchema,
} from '@user/extensions/plugins/url-shortener/validation/schemas';
import { validateRoutePrefix } from '@user/extensions/plugins/url-shortener/validation/prefix-validation';

function mockRequest(pathname: string): NextRequest {
  return {
    method: 'GET',
    nextUrl: { pathname },
    headers: {
      get: () => null,
      has: () => false,
    },
    url: `http://localhost:3000${pathname}`,
  } as unknown as NextRequest;
}

describe('url shortener plugin manifest and registration', () => {
  it('registers plugin in bundled registry with public route and admin pages', () => {
    const plugin = bundledPlugins.find((item) => item.manifest.id === URL_SHORTENER_PLUGIN_ID);

    expect(plugin).toBeDefined();
    expect(plugin?.apiExtensions?.length).toBe(1);
    expect(plugin?.publicRouteExtensions?.length).toBe(1);
    expect(plugin?.adminPageExtensions?.length).toBe(5);
  });

  it('declares expected settings and enablement keys', () => {
    expect(urlShortenerPluginManifest.enablementSettingKey).toBe(URL_SHORTENER_ENABLEMENT_KEY);
    expect(urlShortenerPluginManifest.settings?.map((item) => item.key)).toEqual([
      URL_SHORTENER_ROUTE_PREFIX_KEY,
      URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
      URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
    ]);
  });

  it('declares plugin-owned migration in plugin folder', () => {
    const migration = urlShortenerPluginManifest.migrations?.[0];
    expect(migration?.id).toContain('url-shortener:');
    expect(migration?.file.startsWith('db/migrations/')).toBe(true);

    const absolute = path.join(
      process.cwd(),
      'src/user/extensions/plugins/url-shortener',
      migration?.file ?? ''
    );
    expect(fs.existsSync(absolute)).toBe(true);
  });

  it('keeps migration schema ownership for all required domain tables', () => {
    const migrationPath = path.join(
      process.cwd(),
      'src/user/extensions/plugins/url-shortener/db/migrations/20260701010000_url_shortener_foundation.ts'
    );
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');

    const requiredTables = [
      'u_url_shortener_links',
      'u_url_shortener_click_events',
      'u_url_shortener_daily_stats',
      'u_url_shortener_public_submissions',
      'u_url_shortener_audit_records',
      'u_url_shortener_prefix_aliases',
    ];

    for (const tableName of requiredTables) {
      expect(migrationContent.includes(tableName)).toBe(true);
    }
  });
});

describe('url shortener validation', () => {
  it('normalizes valid single-segment prefixes', () => {
    expect(validateRoutePrefix('/s/')).toBe('/s');
    expect(validateRoutePrefix('go')).toBe('/go');
    expect(validateRoutePrefix(URL_SHORTENER_DEFAULT_PREFIX)).toBe('/s');
  });

  it('rejects reserved and invalid prefixes', () => {
    expect(() => validateRoutePrefix('/')).toThrow();
    expect(() => validateRoutePrefix('/api')).toThrow();
    expect(() => validateRoutePrefix('/admin')).toThrow();
    expect(() => validateRoutePrefix('/_next')).toThrow();
    expect(() => validateRoutePrefix('/a/b')).toThrow();
    expect(() => validateRoutePrefix('/go?x=1')).toThrow();
    expect(() => validateRoutePrefix('/go#frag')).toThrow();
  });

  it('validates short code format', () => {
    expect(shortCodeSchema.parse('abc123')).toBe('abc123');
    expect(() => shortCodeSchema.parse('abc/123')).toThrow();
    expect(() => shortCodeSchema.parse('')).toThrow();
  });

  it('validates destination URL', () => {
    expect(destinationUrlSchema.parse('https://example.com/page')).toBe('https://example.com/page');
    expect(() => destinationUrlSchema.parse('javascript:alert(1)')).toThrow();
    expect(() => destinationUrlSchema.parse('not-a-url')).toThrow();
  });

  it('validates public creation mode and basic create input', () => {
    for (const mode of URL_SHORTENER_ALLOWED_CREATION_MODES) {
      expect(publicCreationModeSchema.parse(mode)).toBe(mode);
    }

    expect(() => publicCreationModeSchema.parse('public-anonymous')).toThrow();

    const parsed = createShortLinkInputSchema.parse({
      destinationUrl: 'https://example.com',
      code: 'my-code',
      publicCreationMode: 'admin-only',
    });

    expect(parsed.code).toBe('my-code');
  });

  it('claims and rewrites /s/<code> through proxy-safe dispatcher', async () => {
    const resolution = await resolvePublicRouteExtension('/s/abc123', mockRequest('/s/abc123'));

    expect(resolution.type).toBe('match');
    if (resolution.type === 'match') {
      expect(resolution.response.status).toBe(200);
      expect(resolution.response.headers.get('x-middleware-rewrite')).toContain(
        '/api/public/url-shortener/abc123'
      );
    }
  });

  it('does not claim reserved API paths', async () => {
    const resolution = await resolvePublicRouteExtension('/api/health', mockRequest('/api/health'));

    expect(resolution.type).toBe('no-match');
  });

  it('preserves URL shortener data through safe plugin update flow', async () => {
    const db = getDb();
    const code = `upgrade-${Date.now().toString(36)}`;
    const linksTableExists = await db.schema.hasTable('u_url_shortener_links');
    let schemaBootstrappedByTest = false;
    const existingPluginRow = await db('devholm_plugins')
      .where({ plugin_id: URL_SHORTENER_PLUGIN_ID })
      .first();
    let pluginRowBootstrappedByTest = false;

    if (!linksTableExists) {
      await setupUrlShortenerSchema(db);
      schemaBootstrappedByTest = true;
    }

    if (!existingPluginRow) {
      await db('devholm_plugins').insert({
        plugin_id: URL_SHORTENER_PLUGIN_ID,
        bundled_version: urlShortenerPluginManifest.version,
        installed_version: urlShortenerPluginManifest.version,
        enabled: false,
        lifecycle_state: 'installed',
        operation_status: 'idle',
        updated_at: new Date(),
      });
      pluginRowBootstrappedByTest = true;
    }

    const originalSettings = await getUrlShortenerSettings(db);
    const originalLock = await getPluginLock(URL_SHORTENER_PLUGIN_ID);

    let linkId: string | null = null;

    try {
      const link = await createUrlShortenerLink(
        {
          code,
          destinationUrl: 'https://example.com/upgrade-check',
          title: 'Upgrade Coverage Link',
        },
        db
      );
      linkId = link.id;

      await updateUrlShortenerSettings(
        {
          routePrefix: originalSettings.routePrefix,
          publicCreationMode: 'authenticated',
          legacyPrefixEnabled: originalSettings.legacyPrefixEnabled,
        },
        db
      );

      await recordUrlShortenerClick(
        link.id,
        new Request(`http://localhost:3000/s/${code}`, {
          headers: new Headers({
            referer: 'https://example.com/',
            'user-agent': 'vitest-upgrade-check',
          }),
        }),
        db
      );

      const overviewBefore = await getUrlShortenerOverview(db);

      const fromVersion = urlShortenerPluginManifest.version;
      const toVersion = `${fromVersion}-upgrade-check`;

      await lockPluginVersion(
        URL_SHORTENER_PLUGIN_ID,
        fromVersion,
        '3.11.0',
        { type: 'bundled' },
        {
          packageChecksum: 'sha256-url-shortener-before',
          manifestChecksum: 'manifest-url-shortener-before',
          migrationChecksums: {},
        },
        'vitest'
      );

      const updateResult = await performSafePluginUpdate(
        URL_SHORTENER_PLUGIN_ID,
        fromVersion,
        toVersion,
        { type: 'bundled' },
        {
          packageChecksum: 'sha256-url-shortener-after',
          manifestChecksum: 'manifest-url-shortener-after',
          migrationChecksums: {},
        },
        '3.11.0',
        {
          pluginId: URL_SHORTENER_PLUGIN_ID,
          fromVersion,
          toVersion,
        },
        undefined,
        undefined,
        'vitest'
      );

      expect(updateResult.success).toBe(true);

      const linkAfter = await getUrlShortenerLinkByCode(code, db);
      const settingsAfter = await getUrlShortenerSettings(db);
      const overviewAfter = await getUrlShortenerOverview(db);
      const lockAfter = await getPluginLock(URL_SHORTENER_PLUGIN_ID);

      expect(linkAfter).not.toBeNull();
      expect(linkAfter?.destinationUrl).toBe('https://example.com/upgrade-check');
      expect((linkAfter?.cachedClickCount ?? 0) >= 1).toBe(true);
      expect(settingsAfter.publicCreationMode).toBe('authenticated');
      expect(overviewAfter.totalClicks >= overviewBefore.totalClicks).toBe(true);
      expect(lockAfter?.version).toBe(toVersion);
    } finally {
      await updateUrlShortenerSettings(originalSettings, db);

      if (originalLock) {
        await lockPluginVersion(
          originalLock.pluginId,
          originalLock.version,
          originalLock.devholmVersion,
          originalLock.source,
          originalLock.integrity,
          originalLock.lockedBy ?? 'vitest'
        );
      } else {
        await db('plugin_lockfile').where({ plugin_id: URL_SHORTENER_PLUGIN_ID }).delete();
      }

      if (linkId) {
        await db('u_url_shortener_daily_stats').where({ link_id: linkId }).delete();
        await db('u_url_shortener_click_events').where({ link_id: linkId }).delete();
        await db('u_url_shortener_links').where({ id: linkId }).delete();
      }

      if (schemaBootstrappedByTest) {
        await teardownUrlShortenerSchema(db);
      }

      if (pluginRowBootstrappedByTest) {
        await db('devholm_plugins').where({ plugin_id: URL_SHORTENER_PLUGIN_ID }).delete();
      }
    }
  });
});
