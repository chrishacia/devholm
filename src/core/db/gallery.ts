import { getDb } from './index';
import { sanitizeUserInput, slugify } from '@/lib';

export interface GalleryCollection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  layout: string;
  isPrivate: boolean;
  isEnabled: boolean;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
  coverMediaId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GalleryItem {
  id: string;
  galleryId: string;
  sortOrder: number;
  kind: 'media' | 'external';
  mediaAssetId: string | null;
  externalUrl: string | null;
  externalProvider: string | null;
  title: string | null;
  caption: string | null;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  media?: {
    id: string;
    publicUrl: string | null;
    mimeType: string;
    width: number | null;
    height: number | null;
    altText: string | null;
    filename: string;
  } | null;
}

interface GalleryCollectionInput {
  name: string;
  slug?: string;
  description?: string | null;
  layout: string;
  isPrivate: boolean;
  isEnabled: boolean;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
  coverMediaId?: string | null;
}

interface GalleryItemInput {
  galleryId: string;
  sortOrder: number;
  kind: 'media' | 'external';
  mediaAssetId?: string | null;
  externalUrl?: string | null;
  externalProvider?: string | null;
  title?: string | null;
  caption?: string | null;
  isEnabled: boolean;
}

function mapCollection(row: Record<string, unknown>): GalleryCollection {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    layout: row.layout as string,
    isPrivate: Boolean(row.is_private),
    isEnabled: Boolean(row.is_enabled),
    showInMainNav: Boolean(row.show_in_main_nav),
    showInFooterMain: Boolean(row.show_in_footer_main),
    showInFooterResources: Boolean(row.show_in_footer_resources),
    includeInSitemap: Boolean(row.include_in_sitemap),
    coverMediaId: (row.cover_media_id as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapItem(row: Record<string, unknown>): GalleryItem {
  return {
    id: row.id as string,
    galleryId: row.gallery_id as string,
    sortOrder: Number(row.sort_order),
    kind: row.kind as 'media' | 'external',
    mediaAssetId: (row.media_asset_id as string | null) ?? null,
    externalUrl: (row.external_url as string | null) ?? null,
    externalProvider: (row.external_provider as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    isEnabled: Boolean(row.is_enabled),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    media: row.media_json
      ? typeof row.media_json === 'string'
        ? JSON.parse(row.media_json as string)
        : (row.media_json as GalleryItem['media'])
      : null,
  };
}

function detectProvider(url?: string | null) {
  if (!url) return null;
  const value = url.toLowerCase();
  if (value.includes('youtube.com') || value.includes('youtu.be')) return 'youtube';
  if (value.includes('tiktok.com')) return 'tiktok';
  if (value.includes('vimeo.com')) return 'vimeo';
  return 'external';
}

function normalizeCollectionInput(input: GalleryCollectionInput) {
  const cleanName = sanitizeUserInput(input.name).trim();
  const cleanSlug = slugify(sanitizeUserInput(input.slug || cleanName));

  return {
    name: cleanName,
    slug: cleanSlug,
    description: input.description ? sanitizeUserInput(input.description).trim() : null,
    layout: sanitizeUserInput(input.layout).trim() || 'masonry',
    is_private: input.isPrivate,
    is_enabled: input.isEnabled,
    show_in_main_nav: input.showInMainNav,
    show_in_footer_main: input.showInFooterMain,
    show_in_footer_resources: input.showInFooterResources,
    include_in_sitemap: input.includeInSitemap,
    cover_media_id: input.coverMediaId || null,
    updated_at: new Date(),
  };
}

export async function listGalleryCollections() {
  const rows = await getDb()('gallery_collections').select('*').orderBy('updated_at', 'desc');
  return rows.map(mapCollection);
}

export async function getGalleryCollectionById(id: string) {
  const row = await getDb()('gallery_collections').where('id', id).first();
  return row ? mapCollection(row) : null;
}

export async function getGalleryCollectionBySlug(slug: string, includePrivate = false) {
  let query = getDb()('gallery_collections').where('slug', slug).where('is_enabled', true);

  if (!includePrivate) {
    query = query.where('is_private', false);
  }

  const row = await query.first();
  return row ? mapCollection(row) : null;
}

export async function createGalleryCollection(input: GalleryCollectionInput) {
  const normalized = normalizeCollectionInput(input);
  const exists = await getDb()('gallery_collections').where('slug', normalized.slug).first();
  if (exists) {
    throw new Error('A gallery with this slug already exists');
  }

  const [created] = await getDb()('gallery_collections').insert(normalized).returning('*');
  return mapCollection(created);
}

export async function updateGalleryCollection(id: string, input: GalleryCollectionInput) {
  const existing = await getDb()('gallery_collections').where('id', id).first();
  if (!existing) return null;

  const normalized = normalizeCollectionInput(input);
  if (normalized.slug !== existing.slug) {
    const slugExists = await getDb()('gallery_collections')
      .where('slug', normalized.slug)
      .whereNot('id', id)
      .first();
    if (slugExists) {
      throw new Error('A gallery with this slug already exists');
    }
  }

  const [updated] = await getDb()('gallery_collections')
    .where('id', id)
    .update(normalized)
    .returning('*');
  return mapCollection(updated);
}

export async function deleteGalleryCollection(id: string) {
  return getDb()('gallery_collections').where('id', id).delete();
}

export async function listGalleryItems(galleryId: string, onlyEnabled = false) {
  let query = getDb()('gallery_items as gi')
    .leftJoin('media_assets as ma', 'ma.id', 'gi.media_asset_id')
    .select(
      'gi.*',
      getDb().raw(
        `json_build_object(
          'id', ma.id,
          'publicUrl', ma.public_url,
          'mimeType', ma.mime_type,
          'width', ma.width,
          'height', ma.height,
          'altText', ma.alt_text,
          'filename', ma.original_filename
        ) as media_json`
      )
    )
    .where('gi.gallery_id', galleryId)
    .orderBy('gi.sort_order', 'asc');

  if (onlyEnabled) {
    query = query.where('gi.is_enabled', true);
  }

  const rows = await query;
  return rows.map(mapItem);
}

export async function createGalleryItem(input: GalleryItemInput) {
  const [created] = await getDb()('gallery_items')
    .insert({
      gallery_id: input.galleryId,
      sort_order: input.sortOrder,
      kind: input.kind,
      media_asset_id: input.mediaAssetId || null,
      external_url: input.externalUrl ? sanitizeUserInput(input.externalUrl).trim() : null,
      external_provider: input.externalProvider || detectProvider(input.externalUrl) || null,
      title: input.title ? sanitizeUserInput(input.title).trim() : null,
      caption: input.caption ? sanitizeUserInput(input.caption).trim() : null,
      is_enabled: input.isEnabled,
      updated_at: new Date(),
    })
    .returning('*');

  return mapItem(created);
}

export async function updateGalleryItem(id: string, input: GalleryItemInput) {
  const exists = await getDb()('gallery_items').where('id', id).first();
  if (!exists) return null;

  const [updated] = await getDb()('gallery_items')
    .where('id', id)
    .update({
      gallery_id: input.galleryId,
      sort_order: input.sortOrder,
      kind: input.kind,
      media_asset_id: input.mediaAssetId || null,
      external_url: input.externalUrl ? sanitizeUserInput(input.externalUrl).trim() : null,
      external_provider: input.externalProvider || detectProvider(input.externalUrl) || null,
      title: input.title ? sanitizeUserInput(input.title).trim() : null,
      caption: input.caption ? sanitizeUserInput(input.caption).trim() : null,
      is_enabled: input.isEnabled,
      updated_at: new Date(),
    })
    .returning('*');

  return mapItem(updated);
}

export async function deleteGalleryItem(id: string) {
  return getDb()('gallery_items').where('id', id).delete();
}

export async function reorderGalleryItems(
  galleryId: string,
  order: Array<{ id: string; sortOrder: number }>
) {
  await getDb().transaction(async (trx) => {
    for (const item of order) {
      await trx('gallery_items')
        .where('gallery_id', galleryId)
        .where('id', item.id)
        .update({ sort_order: item.sortOrder, updated_at: new Date() });
    }
  });
}

export async function listGalleryPublicNavigation() {
  const rows = await getDb()('gallery_collections')
    .select('slug', 'name', 'show_in_main_nav', 'show_in_footer_main', 'show_in_footer_resources')
    .where('is_enabled', true)
    .where('is_private', false)
    .orderBy('name', 'asc');

  const main: Array<{ label: string; href: string }> = [];
  const footerMain: Array<{ label: string; href: string }> = [];
  const footerResources: Array<{ label: string; href: string }> = [];

  for (const row of rows) {
    const item = { label: row.name as string, href: `/gallery/${row.slug as string}` };
    if (row.show_in_main_nav) main.push(item);
    if (row.show_in_footer_main) footerMain.push(item);
    if (row.show_in_footer_resources) footerResources.push(item);
  }

  return { main, footerMain, footerResources };
}

export async function listGallerySitemapEntries() {
  const rows = await getDb()('gallery_collections')
    .select('slug', 'updated_at')
    .where('is_enabled', true)
    .where('is_private', false)
    .where('include_in_sitemap', true);

  return rows.map((row) => ({
    path: `/gallery/${row.slug as string}`,
    lastModified: row.updated_at as Date,
  }));
}
