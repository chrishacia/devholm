/** @vitest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_DB_SUFFIX = `_gallery_it_${process.pid}`;
const configuredTestDbUrl = process.env.PHASE2_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRunPostgresIntegration = Boolean(configuredTestDbUrl);

let adminDb: Knex;
let integrationDb: Knex;
let integrationDbName = '';
let integrationDbUrl = '';
let fixtureDir = '';

function requireBaseDatabaseUrl(): string {
  if (!configuredTestDbUrl) {
    throw new Error(
      'gallery-plugin-preservation-postgres.integration.test requires PHASE2_TEST_DATABASE_URL or DATABASE_URL'
    );
  }

  return configuredTestDbUrl;
}

function withDatabaseName(urlValue: string, dbName: string): string {
  const parsed = new URL(urlValue);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function getDatabaseName(urlValue: string): string {
  const parsed = new URL(urlValue);
  return parsed.pathname.replace(/^\//u, '') || 'postgres';
}

async function closeModuleDb(): Promise<void> {
  try {
    vi.resetModules();
    const dbModule = await import('@/db');
    await dbModule.closeDb();
  } catch {
    // ignore cleanup path errors
  }
}

async function migrateCoreAndUserSchemas(db: Knex): Promise<void> {
  await db.migrate.latest({
    directory: [
      path.join(process.cwd(), 'src/core/db/migrations'),
      path.join(process.cwd(), 'src/user/extensions/db/migrations'),
    ],
    tableName: 'knex_migrations',
    loadExtensions: ['.ts'],
  });
}

function sha256(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const postgresIntegrationDescribe = shouldRunPostgresIntegration
  ? describe.sequential
  : describe.skip;

postgresIntegrationDescribe('gallery canonical preservation (postgres integration)', () => {
  beforeAll(async () => {
    const baseDatabaseUrl = requireBaseDatabaseUrl();
    integrationDbName = `${getDatabaseName(baseDatabaseUrl)}${TEST_DB_SUFFIX}`;
    integrationDbUrl = withDatabaseName(baseDatabaseUrl, integrationDbName);

    const adminUrl = withDatabaseName(baseDatabaseUrl, 'postgres');
    adminDb = knex({
      client: 'pg',
      connection: adminUrl,
      pool: { min: 0, max: 2 },
    });

    await adminDb.raw(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = ? AND pid <> pg_backend_pid()`,
      [integrationDbName]
    );
    await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
    await adminDb.raw(`CREATE DATABASE "${integrationDbName}"`);

    integrationDb = knex({
      client: 'pg',
      connection: integrationDbUrl,
      pool: { min: 0, max: 4 },
    });

    process.env.DATABASE_URL = integrationDbUrl;
    process.env.DATABASE_PASSWORD = 'test';

    await migrateCoreAndUserSchemas(integrationDb);
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devholm-gallery-fixture-'));
  });

  afterAll(async () => {
    await closeModuleDb();

    if (integrationDb) {
      await integrationDb.destroy();
    }

    if (adminDb) {
      await adminDb.raw(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = ? AND pid <> pg_backend_pid()`,
        [integrationDbName]
      );
      await adminDb.raw(`DROP DATABASE IF EXISTS "${integrationDbName}"`);
      await adminDb.destroy();
    }

    if (fixtureDir && fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await closeModuleDb();
    await integrationDb('site_settings')
      .where('key', 'plugin:gallery:baseline-schema-version')
      .del();
    await integrationDb('gallery_items').del();
    await integrationDb('gallery_collections').del();
    await integrationDb('media_assets').del();
  });

  it('keeps gallery/media rows and fixture hashes unchanged across authority reconciliation, re-enable, and upgrade hooks', async () => {
    const mediaId = randomUUID();
    const galleryId = randomUUID();
    const itemId = randomUUID();

    const fixturePath = path.join(fixtureDir, `${mediaId}.jpg`);
    const fixtureContent = Buffer.from('gallery-fixture-media-bytes-v1');
    fs.writeFileSync(fixturePath, fixtureContent);
    const fixtureHashBefore = sha256(fixturePath);

    await integrationDb('media_assets').insert({
      id: mediaId,
      filename: 'fixture.jpg',
      original_filename: 'fixture.jpg',
      mime_type: 'image/jpeg',
      file_size: fixtureContent.length,
      storage_path: fixturePath,
      public_url: '/uploads/fixture.jpg',
      alt_text: 'Fixture Alt',
      caption: 'Fixture Caption',
      width: 1200,
      height: 900,
      uploaded_by: null,
    });

    await integrationDb('gallery_collections').insert({
      id: galleryId,
      name: 'Fixture Gallery',
      slug: 'fixture-gallery',
      description: 'Fixture Description',
      layout: 'masonry',
      is_private: false,
      is_enabled: true,
      show_in_main_nav: true,
      show_in_footer_main: false,
      show_in_footer_resources: true,
      include_in_sitemap: true,
      cover_media_id: mediaId,
    });

    await integrationDb('gallery_items').insert({
      id: itemId,
      gallery_id: galleryId,
      sort_order: 7,
      kind: 'media',
      media_asset_id: mediaId,
      external_url: null,
      external_provider: null,
      title: 'Fixture Item',
      caption: 'Fixture Item Caption',
      is_enabled: true,
    });

    const mediaBefore = await integrationDb('media_assets').where({ id: mediaId }).first();
    const galleryBefore = await integrationDb('gallery_collections')
      .where({ id: galleryId })
      .first();
    const itemBefore = await integrationDb('gallery_items').where({ id: itemId }).first();

    const { up: reconcileUp } = await import(
      '@user/extensions/plugins/gallery/db/migrations/20260718020000_gallery_canonical_authority'
    );
    await reconcileUp(integrationDb);
    await reconcileUp(integrationDb);

    const {
      galleryAfterInstall,
      galleryAfterUpgrade,
      galleryBeforeDisable,
      galleryBeforeUninstall,
      galleryPurge,
    } = await import('@user/extensions/plugins/gallery/lifecycle/hooks');

    await galleryAfterInstall();
    await galleryAfterInstall();
    await galleryBeforeDisable();
    await galleryAfterInstall();
    await galleryAfterUpgrade();
    await galleryBeforeUninstall();

    await expect(galleryPurge()).rejects.toThrow(
      /Gallery purge is blocked while data or media references exist/
    );

    const settingRows = await integrationDb('site_settings')
      .where({ key: 'plugin:gallery:baseline-schema-version' })
      .select('key', 'value');

    expect(settingRows).toHaveLength(1);
    expect(settingRows[0]?.value).toBe(
      'core:20260629010000_add_calendar_gallery_and_media_transforms'
    );

    const mediaAfter = await integrationDb('media_assets').where({ id: mediaId }).first();
    const galleryAfter = await integrationDb('gallery_collections')
      .where({ id: galleryId })
      .first();
    const itemAfter = await integrationDb('gallery_items').where({ id: itemId }).first();

    const collectionCounts = (await integrationDb('gallery_collections').count(
      '* as count'
    )) as Array<{ count: string }>;
    const itemCounts = (await integrationDb('gallery_items').count('* as count')) as Array<{
      count: string;
    }>;
    const mediaCounts = (await integrationDb('media_assets').count('* as count')) as Array<{
      count: string;
    }>;

    expect(Number(collectionCounts[0]?.count ?? 0)).toBe(1);
    expect(Number(itemCounts[0]?.count ?? 0)).toBe(1);
    expect(Number(mediaCounts[0]?.count ?? 0)).toBe(1);

    expect(mediaAfter).toMatchObject({
      id: mediaBefore.id,
      filename: mediaBefore.filename,
      original_filename: mediaBefore.original_filename,
      mime_type: mediaBefore.mime_type,
      file_size: mediaBefore.file_size,
      storage_path: mediaBefore.storage_path,
      public_url: mediaBefore.public_url,
      alt_text: mediaBefore.alt_text,
      caption: mediaBefore.caption,
      width: mediaBefore.width,
      height: mediaBefore.height,
    });

    expect(galleryAfter).toMatchObject({
      id: galleryBefore.id,
      slug: galleryBefore.slug,
      description: galleryBefore.description,
      layout: galleryBefore.layout,
      is_private: galleryBefore.is_private,
      is_enabled: galleryBefore.is_enabled,
      show_in_main_nav: galleryBefore.show_in_main_nav,
      show_in_footer_main: galleryBefore.show_in_footer_main,
      show_in_footer_resources: galleryBefore.show_in_footer_resources,
      include_in_sitemap: galleryBefore.include_in_sitemap,
      cover_media_id: galleryBefore.cover_media_id,
    });

    expect(itemAfter).toMatchObject({
      id: itemBefore.id,
      gallery_id: itemBefore.gallery_id,
      sort_order: itemBefore.sort_order,
      kind: itemBefore.kind,
      media_asset_id: itemBefore.media_asset_id,
      title: itemBefore.title,
      caption: itemBefore.caption,
      is_enabled: itemBefore.is_enabled,
    });

    const fixtureHashAfter = sha256(fixturePath);
    expect(fixtureHashAfter).toBe(fixtureHashBefore);
  });

  it('allows purge only when gallery tables are empty', async () => {
    const { up: reconcileUp } = await import(
      '@user/extensions/plugins/gallery/db/migrations/20260718020000_gallery_canonical_authority'
    );
    await reconcileUp(integrationDb);

    const { galleryPurge } = await import('@user/extensions/plugins/gallery/lifecycle/hooks');
    await expect(galleryPurge()).resolves.toBeUndefined();
  });
});
