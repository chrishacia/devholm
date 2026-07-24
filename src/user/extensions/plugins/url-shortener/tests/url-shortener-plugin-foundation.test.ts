import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { getPluginLock, lockPluginVersion } from '@core/db/plugin-versioning';
import { performSafePluginUpdate } from '@core/lib/plugin-safe-activation.server';
import { resolvePublicRouteExtension } from '@core/lib/public-route-dispatcher.server';
import { bundledPlugins } from '@user/extensions/plugins/registry';
import {
  createUrlShortenerPublicSubmission,
  createUrlShortenerLink,
  deleteUrlShortenerLink,
  getUrlShortenerLinkByCode,
  listUrlShortenerLinks,
  getUrlShortenerOverview,
  getUrlShortenerSettings,
  listUrlShortenerPublicSubmissions,
  recordUrlShortenerClick,
  reviewUrlShortenerPublicSubmission,
  updateUrlShortenerLink,
  updateUrlShortenerSettings,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';
import {
  down as teardownUrlShortenerSchema,
  up as setupUrlShortenerSchema,
} from '@user/extensions/plugins/url-shortener/db/migrations/20260701010000_url_shortener_foundation';

const isPluginEnabledForRequest = vi.hoisted(() => vi.fn());

vi.mock('@core/db/plugins-enabled', () => ({
  isPluginEnabledForRequest,
}));
import {
  URL_SHORTENER_ALLOWED_CREATION_MODES,
  URL_SHORTENER_DEFAULT_PREFIX,
  URL_SHORTENER_ENABLEMENT_KEY,
  URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
  URL_SHORTENER_PLUGIN_ID,
  URL_SHORTENER_PERMISSION_ADMIN_MANAGE,
  URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
  URL_SHORTENER_ROUTE_PREFIX_KEY,
} from '@user/extensions/plugins/url-shortener/constants';
import { urlShortenerPluginManifest } from '@user/extensions/plugins/url-shortener/manifest';
import { urlShortenerAdminPageExtensions } from '@user/extensions/plugins/url-shortener/admin/pages';
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

  it('publishes canonical registry contract metadata for identity, provenance, and policy', () => {
    const registryPath = path.join(process.cwd(), 'generated/plugins/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      content?: {
        plugins?: Array<{
          pluginId: string;
          selectedVersion: string;
          publisherId: string;
          sourceKind: string;
          immutableRef: string;
          artifactSha256: string | null;
          manifestId: string;
          compatibility?: { devholmVersion?: string };
          contributionSummary?: {
            frontendAdminPages?: string[];
            serverPublicRouteIds?: string[];
            lifecycleHooks?: string[];
          };
          policySummary?: {
            allowLocalOverrideInDevelopment?: boolean;
            requireImmutableArtifactInProduction?: boolean;
            requireDigestInProduction?: boolean;
            dependencyPolicyMode?: string;
          };
          localOverride?: {
            enabled?: boolean;
            developmentOnly?: boolean;
          };
        }>;
      };
    };

    const urlShortener = registry.content?.plugins?.find(
      (plugin) => plugin.pluginId === URL_SHORTENER_PLUGIN_ID
    );

    expect(urlShortener).toBeDefined();
    expect(urlShortener?.selectedVersion).toBe(urlShortenerPluginManifest.version);
    expect(urlShortener?.publisherId).toBe('devholm-first-party');
    expect(urlShortener?.sourceKind).toBe('bundled-fallback-artifact');
    expect(urlShortener?.immutableRef).toBe('bundled:url-shortener@0.1.0');
    expect(urlShortener?.artifactSha256).toMatch(/^[a-f0-9]{64}$/i);
    expect(urlShortener?.manifestId).toBe(URL_SHORTENER_PLUGIN_ID);
    expect(urlShortener?.compatibility?.devholmVersion).toBe(
      urlShortenerPluginManifest.devholmVersion
    );

    expect(urlShortener?.contributionSummary?.frontendAdminPages).toEqual(
      [...(urlShortenerPluginManifest.adminPageHrefs ?? [])].sort((left, right) =>
        left.localeCompare(right)
      )
    );
    expect(urlShortener?.contributionSummary?.serverPublicRouteIds).toEqual(
      urlShortenerPluginManifest.publicRouteExtensionIds
    );
    expect(urlShortener?.contributionSummary?.lifecycleHooks).toEqual(['purge']);

    expect(urlShortener?.policySummary?.allowLocalOverrideInDevelopment).toBe(true);
    expect(urlShortener?.policySummary?.requireImmutableArtifactInProduction).toBe(true);
    expect(urlShortener?.policySummary?.requireDigestInProduction).toBe(true);
    expect(urlShortener?.policySummary?.dependencyPolicyMode).toBe('self-contained');

    expect(urlShortener?.localOverride).toEqual({
      enabled: false,
      developmentOnly: false,
    });
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

  it('keeps canonical plugin-owned authority for all admin pages', async () => {
    const expectedHrefs = [
      '/admin/url-shortener/overview',
      '/admin/url-shortener/links',
      '/admin/url-shortener/analytics',
      '/admin/url-shortener/public-submissions',
      '/admin/url-shortener/settings',
    ];

    const hrefs = urlShortenerAdminPageExtensions.map((page) => page.href);
    expect(hrefs).toEqual(expectedHrefs);

    for (const page of urlShortenerAdminPageExtensions) {
      expect(page.pluginId).toBe(URL_SHORTENER_PLUGIN_ID);
      expect(page.accessPolicy).toBeDefined();
      expect(page.accessPolicy?.runtimeOwner).toBe('plugin-extension');
      expect(page.accessPolicy?.scope).toBe('admin');
      expect(page.accessPolicy?.permissionKeys).toContain(URL_SHORTENER_PERMISSION_ADMIN_MANAGE);

      const loaded = await page.loadPage();
      const component = 'default' in loaded ? loaded.default : loaded;
      expect(component).toBeTypeOf('function');

      const metadata = page.getMetadata ? await page.getMetadata() : null;
      expect(metadata?.title).toBeTypeOf('string');
      expect((metadata?.title as string).toLowerCase()).toContain('url shortener');
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
    isPluginEnabledForRequest.mockResolvedValue(true);
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
    isPluginEnabledForRequest.mockResolvedValue(true);
    const resolution = await resolvePublicRouteExtension('/api/health', mockRequest('/api/health'));

    expect(resolution.type).toBe('no-match');
  });

  it('fails closed for route claim when canonical enablement is disabled', async () => {
    isPluginEnabledForRequest.mockResolvedValue(false);
    const resolution = await resolvePublicRouteExtension('/s/abc123', mockRequest('/s/abc123'));
    expect(resolution.type).toBe('no-match');
  });

  it('supports generated code, collision rejection, edit, disable, delete, and persistence', async () => {
    const db = getDb();
    const linksTableExists = await db.schema.hasTable('u_url_shortener_links');
    let schemaBootstrappedByTest = false;

    if (!linksTableExists) {
      await setupUrlShortenerSchema(db);
      schemaBootstrappedByTest = true;
    }

    const explicitCode = `fn-${Date.now().toString(36)}`;
    let generatedCode: string | null = null;

    try {
      const generated = await createUrlShortenerLink(
        {
          destinationUrl: 'https://example.com/generated-target',
          title: 'Generated Title',
        },
        db
      );
      generatedCode = generated.code;

      expect(generated.code.length).toBeGreaterThan(4);
      expect(generated.destinationUrl).toBe('https://example.com/generated-target');

      const firstExplicit = await createUrlShortenerLink(
        {
          code: explicitCode,
          destinationUrl: 'https://example.com/explicit-1',
          title: 'Explicit Link',
        },
        db
      );
      expect(firstExplicit.code).toBe(explicitCode);

      await expect(
        createUrlShortenerLink(
          {
            code: explicitCode,
            destinationUrl: 'https://example.com/explicit-2',
          },
          db
        )
      ).rejects.toBeTruthy();

      const updated = await updateUrlShortenerLink(
        explicitCode,
        {
          destinationUrl: 'https://example.com/updated',
          title: 'Updated Title',
          redirectStatusCode: 308,
          isActive: false,
        },
        db
      );

      expect(updated?.destinationUrl).toBe('https://example.com/updated');
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.redirectStatusCode).toBe(308);
      expect(updated?.isActive).toBe(false);

      const restored = await updateUrlShortenerLink(
        explicitCode,
        {
          isActive: true,
        },
        db
      );
      expect(restored?.isActive).toBe(true);

      const deleted = await deleteUrlShortenerLink(explicitCode, db);
      expect(deleted?.isActive).toBe(false);
      expect(deleted?.deletedAt).not.toBeNull();

      const listed = await listUrlShortenerLinks(db);
      expect(listed.some((link) => link.code === explicitCode)).toBe(false);

      const fetchedDeleted = await getUrlShortenerLinkByCode(explicitCode, db);
      expect(fetchedDeleted?.deletedAt).not.toBeNull();
      expect(fetchedDeleted?.isActive).toBe(false);

      const fetchedGenerated = await getUrlShortenerLinkByCode(generated.code, db);
      expect(fetchedGenerated?.code).toBe(generated.code);
      expect(fetchedGenerated?.destinationUrl).toBe('https://example.com/generated-target');
    } finally {
      if (generatedCode) {
        await db('u_url_shortener_links').where({ code: generatedCode }).delete();
      }
      await db('u_url_shortener_links').where({ code: explicitCode }).delete();

      if (schemaBootstrappedByTest) {
        await teardownUrlShortenerSchema(db);
      }
    }
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

      await recordUrlShortenerClick(link.id, new Request(`http://localhost:3000/s/${code}`), db);
      await recordUrlShortenerClick(link.id, new Request(`http://localhost:3000/s/${code}`), db);

      const concurrentNullDimensionClicks = 8;
      await Promise.all(
        Array.from({ length: concurrentNullDimensionClicks }, () =>
          recordUrlShortenerClick(link.id, new Request(`http://localhost:3000/s/${code}`), db)
        )
      );

      await recordUrlShortenerClick(
        link.id,
        new Request(`http://localhost:3000/s/${code}`, {
          headers: new Headers({
            referer: 'https://www.google.com/search?q=devholm',
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
          }),
        }),
        db
      );

      await recordUrlShortenerClick(
        link.id,
        new Request(`http://localhost:3000/s/${code}`, {
          headers: new Headers({
            referer: 'https://www.google.com/search?q=devholm',
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
          }),
        }),
        db
      );

      await recordUrlShortenerClick(
        link.id,
        new Request(`http://localhost:3000/s/${code}`, {
          headers: new Headers({
            referer: 'https://x.com/devholm',
            'user-agent': 'Mozilla/5.0 Firefox/126.0',
          }),
        }),
        db
      );

      const nullDimensionDailyRows = await db('u_url_shortener_daily_stats')
        .where({ link_id: link.id })
        .whereNull('referrer_category')
        .where({ device_category: 'desktop' })
        .whereNull('browser_category')
        .select('total_clicks')
        .first();

      expect(Number(nullDimensionDailyRows?.total_clicks ?? 0)).toBe(
        2 + concurrentNullDimensionClicks
      );

      const googleDesktopChromeRows = await db('u_url_shortener_daily_stats')
        .where({
          link_id: link.id,
          referrer_category: 'search',
          device_category: 'desktop',
          browser_category: 'chrome',
        })
        .count<{ count: string }[]>({ count: '*' })
        .first();
      expect(Number(googleDesktopChromeRows?.count ?? 0)).toBe(1);

      const xDesktopFirefoxRows = await db('u_url_shortener_daily_stats')
        .where({
          link_id: link.id,
          referrer_category: 'social',
          device_category: 'desktop',
          browser_category: 'firefox',
        })
        .count<{ count: string }[]>({ count: '*' })
        .first();
      expect(Number(xDesktopFirefoxRows?.count ?? 0)).toBe(1);

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
      expect((linkAfter?.cachedClickCount ?? 0) >= 14).toBe(true);
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

  it('supports public submission lifecycle at store layer', async () => {
    const db = getDb();
    const linksTableExists = await db.schema.hasTable('u_url_shortener_links');
    let schemaBootstrappedByTest = false;

    if (!linksTableExists) {
      await setupUrlShortenerSchema(db);
      schemaBootstrappedByTest = true;
    }

    let rejectedSubmissionId: string | null = null;
    let approvedSubmissionId: string | null = null;
    let approvedCode: string | null = null;

    try {
      const rejected = await createUrlShortenerPublicSubmission(
        {
          destinationUrl: 'https://example.com/submissions/rejected',
          requestedCode: `reject-${Date.now().toString(36)}`,
          requesterType: 'public',
          requesterLabel: 'Submission Reject',
        },
        db
      );
      rejectedSubmissionId = rejected.id;

      const rejectedResult = await reviewUrlShortenerPublicSubmission(
        rejected.id,
        {
          decision: 'rejected',
          reviewNotes: 'Rejected for coverage',
        },
        db
      );

      expect(rejectedResult?.submission.status).toBe('rejected');
      expect(rejectedResult?.link).toBeNull();

      const approveCode = `approve-${Date.now().toString(36)}`;
      const approved = await createUrlShortenerPublicSubmission(
        {
          destinationUrl: 'https://example.com/submissions/approved',
          requestedCode: approveCode,
          requesterType: 'public',
          requesterLabel: 'Submission Approve',
        },
        db
      );
      approvedSubmissionId = approved.id;
      approvedCode = approveCode;

      const approvedResult = await reviewUrlShortenerPublicSubmission(
        approved.id,
        {
          decision: 'approved',
          reviewNotes: 'Approved for coverage',
          title: 'Approved Submission Link',
        },
        db
      );

      expect(approvedResult?.submission.status).toBe('approved');
      expect(approvedResult?.link?.code).toBe(approveCode);

      const listed = await listUrlShortenerPublicSubmissions(db);
      expect(listed.some((item) => item.id === rejected.id)).toBe(true);
      expect(listed.some((item) => item.id === approved.id)).toBe(true);

      const approvedLink = await getUrlShortenerLinkByCode(approveCode, db);
      expect(approvedLink?.destinationUrl).toBe('https://example.com/submissions/approved');
    } finally {
      if (approvedCode) {
        await db('u_url_shortener_links').where({ code: approvedCode }).delete();
      }
      if (rejectedSubmissionId) {
        await db('u_url_shortener_public_submissions').where({ id: rejectedSubmissionId }).delete();
      }
      if (approvedSubmissionId) {
        await db('u_url_shortener_public_submissions').where({ id: approvedSubmissionId }).delete();
      }
      if (schemaBootstrappedByTest) {
        await teardownUrlShortenerSchema(db);
      }
    }
  });

  it('blocks approval when requested code already exists and preserves pending submission state', async () => {
    const db = getDb();
    const linksTableExists = await db.schema.hasTable('u_url_shortener_links');
    let schemaBootstrappedByTest = false;

    if (!linksTableExists) {
      await setupUrlShortenerSchema(db);
      schemaBootstrappedByTest = true;
    }

    const duplicateCode = `dup-${Date.now().toString(36)}`;
    let submissionId: string | null = null;

    try {
      const existingLink = await createUrlShortenerLink(
        {
          code: duplicateCode,
          destinationUrl: 'https://example.com/existing-link',
          title: 'Existing Link',
        },
        db
      );

      const submission = await createUrlShortenerPublicSubmission(
        {
          destinationUrl: 'https://example.com/submission-duplicate',
          requestedCode: duplicateCode,
          requesterType: 'public',
          requesterLabel: 'Duplicate Submission',
        },
        db
      );
      submissionId = submission.id;

      await expect(
        reviewUrlShortenerPublicSubmission(
          submission.id,
          {
            decision: 'approved',
            reviewNotes: 'Approval should fail due to duplicate code',
          },
          db
        )
      ).rejects.toBeTruthy();

      const submissions = await listUrlShortenerPublicSubmissions(db);
      const afterFailure = submissions.find((item) => item.id === submission.id);

      expect(afterFailure?.status).toBe('pending');
      expect(afterFailure?.resultLinkId).toBeNull();
      expect(afterFailure?.approvedAt).toBeNull();
      expect(afterFailure?.rejectedAt).toBeNull();

      const existingLinkAfter = await getUrlShortenerLinkByCode(duplicateCode, db);
      expect(existingLinkAfter?.id).toBe(existingLink.id);
      expect(existingLinkAfter?.destinationUrl).toBe('https://example.com/existing-link');
      expect(existingLinkAfter?.isActive).toBe(true);
    } finally {
      if (submissionId) {
        await db('u_url_shortener_public_submissions').where({ id: submissionId }).delete();
      }
      await db('u_url_shortener_links').where({ code: duplicateCode }).delete();
      if (schemaBootstrappedByTest) {
        await teardownUrlShortenerSchema(db);
      }
    }
  });

  it('preserves links, analytics, submissions, and settings through disable and re-enable transitions', async () => {
    const db = getDb();
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
        enabled: true,
        lifecycle_state: 'installed',
        operation_status: 'idle',
        updated_at: new Date(),
      });
      pluginRowBootstrappedByTest = true;
    }

    const originalSettings = await getUrlShortenerSettings(db);
    const code = `persist-${Date.now().toString(36)}`;
    let linkId: string | null = null;
    let submissionId: string | null = null;

    try {
      await updateUrlShortenerSettings(
        {
          routePrefix: '/s',
          publicCreationMode: 'authenticated',
          legacyPrefixEnabled: true,
        },
        db
      );

      const link = await createUrlShortenerLink(
        {
          code,
          destinationUrl: 'https://example.com/persistence-proof',
          title: 'Persistence Proof Link',
        },
        db
      );
      linkId = link.id;

      await recordUrlShortenerClick(
        link.id,
        new Request(`http://localhost:3000/s/${code}`, {
          headers: new Headers({
            referer: 'https://x.com/devholm',
            'user-agent': 'Mozilla/5.0 Firefox/126.0',
          }),
        }),
        db
      );

      const submission = await createUrlShortenerPublicSubmission(
        {
          destinationUrl: 'https://example.com/persistence-submission',
          requestedCode: `persist-sub-${Date.now().toString(36)}`,
          requesterType: 'public',
          requesterLabel: 'Persistence User',
        },
        db
      );
      submissionId = submission.id;

      await db('devholm_plugins').where({ plugin_id: URL_SHORTENER_PLUGIN_ID }).update({
        enabled: false,
        lifecycle_state: 'disabled',
        updated_at: new Date(),
      });

      await db('devholm_plugins').where({ plugin_id: URL_SHORTENER_PLUGIN_ID }).update({
        enabled: true,
        lifecycle_state: 'installed',
        updated_at: new Date(),
      });

      const linkAfter = await getUrlShortenerLinkByCode(code, db);
      const overviewAfter = await getUrlShortenerOverview(db);
      const settingsAfter = await getUrlShortenerSettings(db);
      const submissionsAfter = await listUrlShortenerPublicSubmissions(db);

      expect(linkAfter).not.toBeNull();
      expect(linkAfter?.destinationUrl).toBe('https://example.com/persistence-proof');
      expect(linkAfter?.cachedClickCount).toBeGreaterThanOrEqual(1);
      expect(overviewAfter.totalClicks).toBeGreaterThanOrEqual(1);
      expect(settingsAfter.routePrefix).toBe('/s');
      expect(settingsAfter.publicCreationMode).toBe('authenticated');
      expect(settingsAfter.legacyPrefixEnabled).toBe(true);
      expect(submissionsAfter.some((item) => item.id === submission.id)).toBe(true);
    } finally {
      await updateUrlShortenerSettings(originalSettings, db);

      if (submissionId) {
        await db('u_url_shortener_public_submissions').where({ id: submissionId }).delete();
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
