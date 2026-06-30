import { getDb } from './index';
import { parseMarkdown, sanitizeUserInput, slugify } from '@/lib';
import type { DevPageDefinition, DevPageRuntimeState, NavigationLink } from '@core/types/dev-pages';

export interface CmsPageRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  contentMarkdown: string;
  contentHtml: string | null;
  status: 'draft' | 'published' | 'archived';
  publishedAt: Date | null;
  isEnabled: boolean;
  navLabel: string | null;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CmsPageUpsertInput {
  title: string;
  slug?: string;
  excerpt?: string | null;
  content: string;
  status: 'draft' | 'published' | 'archived';
  isEnabled: boolean;
  navLabel?: string | null;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
  authorId?: string;
}

function normalizePath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return '/' + segments.join('/');
}

function mapCmsPage(row: Record<string, unknown>): CmsPageRow {
  return {
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    excerpt: (row.excerpt as string | null) ?? null,
    contentMarkdown: (row.content_markdown as string) ?? '',
    contentHtml: (row.content_html as string | null) ?? null,
    status: row.status as 'draft' | 'published' | 'archived',
    publishedAt: (row.published_at as Date | null) ?? null,
    isEnabled: Boolean(row.is_enabled),
    navLabel: (row.nav_label as string | null) ?? null,
    showInMainNav: Boolean(row.show_in_main_nav),
    showInFooterMain: Boolean(row.show_in_footer_main),
    showInFooterResources: Boolean(row.show_in_footer_resources),
    includeInSitemap: Boolean(row.include_in_sitemap),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapDevPage(row: Record<string, unknown>): DevPageRuntimeState {
  return {
    pageKey: row.page_key as string,
    path: row.path as string,
    title: row.title as string,
    navLabel: (row.nav_label as string | null) ?? null,
    isEnabled: Boolean(row.is_enabled),
    showInMainNav: Boolean(row.show_in_main_nav),
    showInFooterMain: Boolean(row.show_in_footer_main),
    showInFooterResources: Boolean(row.show_in_footer_resources),
    includeInSitemap: Boolean(row.include_in_sitemap),
    updatedAt: row.updated_at as Date,
  };
}

export async function listAdminCmsPages(params: {
  page: number;
  limit: number;
  status?: string;
  search?: string;
}) {
  const { page, limit, status, search } = params;
  const db = getDb();
  const offset = (page - 1) * limit;

  let query = db('pages').select('*').orderBy('updated_at', 'desc');
  let countQuery = db('pages').count('* as count');

  if (status && status !== 'all') {
    query = query.where('status', status);
    countQuery = countQuery.where('status', status);
  }

  if (search) {
    query = query.where(function () {
      this.whereILike('title', `%${search}%`).orWhereILike('slug', `%${search}%`);
    });
    countQuery = countQuery.where(function () {
      this.whereILike('title', `%${search}%`).orWhereILike('slug', `%${search}%`);
    });
  }

  const [{ count }] = await countQuery;
  const rows = await query.limit(limit).offset(offset);

  return {
    pages: rows.map(mapCmsPage),
    total: Number(count),
  };
}

export async function getAdminCmsPageById(id: string) {
  const row = await getDb()('pages').where('id', id).first();
  return row ? mapCmsPage(row) : null;
}

export async function createCmsPage(input: CmsPageUpsertInput) {
  const db = getDb();
  const cleanTitle = sanitizeUserInput(input.title).trim();
  const cleanSlug = slugify(sanitizeUserInput(input.slug || cleanTitle));
  const cleanContent = input.content.trim();

  const exists = await db('pages').where('slug', cleanSlug).first();
  if (exists) {
    throw new Error('A page with this slug already exists');
  }

  const now = new Date();
  const [created] = await db('pages')
    .insert({
      title: cleanTitle,
      slug: cleanSlug,
      excerpt: input.excerpt ? sanitizeUserInput(input.excerpt).trim() : null,
      content_markdown: cleanContent,
      content_html: parseMarkdown(cleanContent),
      status: input.status,
      published_at: input.status === 'published' ? now : null,
      is_enabled: input.isEnabled,
      nav_label: input.navLabel ? sanitizeUserInput(input.navLabel).trim() : null,
      show_in_main_nav: input.showInMainNav,
      show_in_footer_main: input.showInFooterMain,
      show_in_footer_resources: input.showInFooterResources,
      include_in_sitemap: input.includeInSitemap,
      author_id: input.authorId || null,
    })
    .returning('*');

  return mapCmsPage(created);
}

export async function updateCmsPage(id: string, input: CmsPageUpsertInput) {
  const db = getDb();
  const existing = await db('pages').where('id', id).first();
  if (!existing) {
    return null;
  }

  const cleanTitle = sanitizeUserInput(input.title).trim();
  const cleanSlug = slugify(sanitizeUserInput(input.slug || cleanTitle));
  const cleanContent = input.content.trim();

  if (cleanSlug !== existing.slug) {
    const slugExists = await db('pages').where('slug', cleanSlug).whereNot('id', id).first();
    if (slugExists) {
      throw new Error('A page with this slug already exists');
    }
  }

  const updatePayload: Record<string, unknown> = {
    title: cleanTitle,
    slug: cleanSlug,
    excerpt: input.excerpt ? sanitizeUserInput(input.excerpt).trim() : null,
    content_markdown: cleanContent,
    content_html: parseMarkdown(cleanContent),
    status: input.status,
    is_enabled: input.isEnabled,
    nav_label: input.navLabel ? sanitizeUserInput(input.navLabel).trim() : null,
    show_in_main_nav: input.showInMainNav,
    show_in_footer_main: input.showInFooterMain,
    show_in_footer_resources: input.showInFooterResources,
    include_in_sitemap: input.includeInSitemap,
    updated_at: new Date(),
  };

  if (input.status === 'published' && !existing.published_at) {
    updatePayload.published_at = new Date();
  }

  const [updated] = await db('pages').where('id', id).update(updatePayload).returning('*');
  return mapCmsPage(updated);
}

export async function deleteCmsPage(id: string) {
  return getDb()('pages').where('id', id).delete();
}

export async function getPublishedCmsPageBySlug(slug: string) {
  const row = await getDb()('pages')
    .where('slug', slug)
    .where('status', 'published')
    .where('is_enabled', true)
    .first();

  return row ? mapCmsPage(row) : null;
}

export async function listCmsNavigationLinks() {
  const rows = await getDb()('pages')
    .select(
      'slug',
      'title',
      'nav_label',
      'show_in_main_nav',
      'show_in_footer_main',
      'show_in_footer_resources'
    )
    .where('status', 'published')
    .where('is_enabled', true)
    .orderBy('title', 'asc');

  const main: NavigationLink[] = [];
  const footerMain: NavigationLink[] = [];
  const footerResources: NavigationLink[] = [];

  for (const row of rows) {
    const href = `/${row.slug as string}`;
    const label = ((row.nav_label as string | null) || (row.title as string)).trim();
    const item = { href, label };

    if (row.show_in_main_nav) main.push(item);
    if (row.show_in_footer_main) footerMain.push(item);
    if (row.show_in_footer_resources) footerResources.push(item);
  }

  return { main, footerMain, footerResources };
}

export async function listCmsSitemapPaths() {
  const rows = await getDb()('pages')
    .select('slug', 'updated_at')
    .where('status', 'published')
    .where('is_enabled', true)
    .where('include_in_sitemap', true);

  return rows.map((row) => ({
    path: `/${row.slug as string}`,
    lastModified: row.updated_at as Date,
  }));
}

export async function syncDevPageDefinitions(definitions: DevPageDefinition[]) {
  const db = getDb();

  await db.transaction(async (trx) => {
    for (const def of definitions) {
      await trx('dev_pages')
        .insert({
          page_key: def.key,
          path: normalizePath(def.path),
          title: def.title,
          nav_label: def.navLabelByDefault || null,
          is_enabled: def.enabledByDefault !== false,
          show_in_main_nav: def.showInMainNavByDefault === true,
          show_in_footer_main: def.showInFooterMainByDefault === true,
          show_in_footer_resources: def.showInFooterResourcesByDefault === true,
          include_in_sitemap: def.includeInSitemapByDefault === true,
          updated_at: new Date(),
        })
        .onConflict('page_key')
        .merge({
          path: normalizePath(def.path),
          title: def.title,
          updated_at: new Date(),
        });
    }
  });
}

export async function listAdminDevPages(definitions: DevPageDefinition[]) {
  await syncDevPageDefinitions(definitions);

  const rows = await getDb()('dev_pages').select('*').orderBy('title', 'asc');
  const byKey = new Map(definitions.map((def) => [def.key, def]));

  return rows.map((row) => mapDevPage(row)).filter((row) => byKey.has(row.pageKey));
}

export async function updateDevPagesStates(
  updates: Array<
    Pick<
      DevPageRuntimeState,
      | 'pageKey'
      | 'isEnabled'
      | 'showInMainNav'
      | 'showInFooterMain'
      | 'showInFooterResources'
      | 'includeInSitemap'
      | 'navLabel'
    >
  >
) {
  const db = getDb();

  await db.transaction(async (trx) => {
    for (const update of updates) {
      await trx('dev_pages')
        .where('page_key', update.pageKey)
        .update({
          is_enabled: update.isEnabled,
          show_in_main_nav: update.showInMainNav,
          show_in_footer_main: update.showInFooterMain,
          show_in_footer_resources: update.showInFooterResources,
          include_in_sitemap: update.includeInSitemap,
          nav_label: update.navLabel ? sanitizeUserInput(update.navLabel).trim() : null,
          updated_at: new Date(),
        });
    }
  });
}

export async function getEnabledDevPageByPath(pathname: string, definitions: DevPageDefinition[]) {
  await syncDevPageDefinitions(definitions);

  const normalized = normalizePath(pathname);
  const row = await getDb()('dev_pages')
    .where('path', normalized)
    .where('is_enabled', true)
    .first();

  if (!row) {
    return null;
  }

  const state = mapDevPage(row);
  const definition = definitions.find((item) => item.key === state.pageKey);
  if (!definition) {
    return null;
  }

  return { state, definition };
}

export async function listDevPageNavigationLinks(definitions: DevPageDefinition[]) {
  const rows = await listAdminDevPages(definitions);

  const main: NavigationLink[] = [];
  const footerMain: NavigationLink[] = [];
  const footerResources: NavigationLink[] = [];

  for (const row of rows) {
    if (!row.isEnabled) continue;

    const item = { href: row.path, label: (row.navLabel || row.title).trim() };

    if (row.showInMainNav) main.push(item);
    if (row.showInFooterMain) footerMain.push(item);
    if (row.showInFooterResources) footerResources.push(item);
  }

  return { main, footerMain, footerResources };
}

export async function listDevPageSitemapPaths(definitions: DevPageDefinition[]) {
  const rows = await listAdminDevPages(definitions);
  return rows
    .filter((row) => row.isEnabled && row.includeInSitemap)
    .map((row) => ({ path: row.path, lastModified: row.updatedAt }));
}
