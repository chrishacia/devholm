import { createHash, randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { getDb } from '@/db';
import {
  URL_SHORTENER_DEFAULT_PREFIX,
  URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
  URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
  URL_SHORTENER_ROUTE_PREFIX_KEY,
} from '@user/extensions/plugins/url-shortener/constants';
import {
  createShortLinkInputSchema,
  destinationUrlSchema,
  publicCreationModeSchema,
  shortCodeSchema,
} from '@user/extensions/plugins/url-shortener/validation/schemas';

const LINKS = 'u_url_shortener_links';
const CLICKS = 'u_url_shortener_click_events';
const DAILY = 'u_url_shortener_daily_stats';
const SETTINGS = 'site_settings';

type LinkRow = {
  id: string;
  code: string;
  destination_url: string;
  title: string | null;
  is_active: boolean;
  expires_at: Date | string | null;
  redirect_status_code: number;
  creator_type: string | null;
  creator_id: string | null;
  creator_label: string | null;
  source_submission_id: string | null;
  cached_click_count: string | number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

export interface UrlShortenerLink {
  id: string;
  code: string;
  destinationUrl: string;
  title: string | null;
  isActive: boolean;
  expiresAt: string | null;
  redirectStatusCode: number;
  cachedClickCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface UrlShortenerSettings {
  routePrefix: string;
  publicCreationMode: 'admin-only' | 'authenticated' | 'public-with-approval';
  legacyPrefixEnabled: boolean;
}

export interface UrlShortenerOverview {
  totalLinks: number;
  activeLinks: number;
  disabledLinks: number;
  expiredLinks: number;
  totalClicks: number;
  recentDailyClicks: Array<{ date: string; totalClicks: number }>;
}

export interface CreateShortLinkInput {
  code?: string;
  destinationUrl: string;
  title?: string;
  redirectStatusCode?: number;
  expiresAt?: string | Date | null;
  creatorType?: string | null;
  creatorId?: string | null;
  creatorLabel?: string | null;
}

export interface UpdateShortLinkInput {
  destinationUrl?: string;
  title?: string | null;
  redirectStatusCode?: number;
  expiresAt?: string | Date | null;
  isActive?: boolean;
}

function getDatabase(db?: Knex): Knex {
  return db ?? getDb();
}

function toIso(value: unknown): string {
  return new Date(value as string | number | Date).toISOString();
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as { code?: string }).code === '23505';
}

function serializeLink(row: LinkRow): UrlShortenerLink {
  return {
    id: row.id,
    code: row.code,
    destinationUrl: row.destination_url,
    title: row.title,
    isActive: Boolean(row.is_active),
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    redirectStatusCode: Number(row.redirect_status_code),
    cachedClickCount: toNumber(row.cached_click_count),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
  };
}

function normalizeCode(value: string): string {
  return shortCodeSchema.parse(value.trim());
}

function generateShortCode(input: { title?: string; destinationUrl: string }): string {
  const title = input.title?.trim();
  const hostname = new URL(input.destinationUrl).hostname;
  const base = (title || hostname || 'link')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  const fallback = base || 'link';
  return normalizeCode(`${fallback.slice(0, 40)}-${randomUUID().slice(0, 8)}`);
}

function sanitizeRedirectStatusCode(value: number | undefined): number {
  if (value === 301 || value === 302 || value === 307 || value === 308) {
    return value;
  }

  return 302;
}

function getRequestSignals(request: Request): {
  referrerDomain: string | null;
  referrerCategory: string | null;
  userAgentCategory: string | null;
  deviceCategory: string | null;
  browserCategory: string | null;
  countryCode: string | null;
  regionCode: string | null;
  privacyHash: string | null;
  requestId: string | null;
} {
  const headers = request.headers;
  const userAgent = headers.get('user-agent') ?? '';
  const referrer = headers.get('referer') ?? headers.get('referrer') ?? '';
  const requestId = headers.get('x-request-id') ?? headers.get('x-vercel-id') ?? null;
  const countryCode = headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry') ?? null;
  const regionCode = headers.get('x-vercel-ip-country-region') ?? headers.get('cf-region') ?? null;

  let referrerDomain: string | null = null;
  if (referrer) {
    try {
      referrerDomain = new URL(referrer).hostname.toLowerCase();
    } catch {
      referrerDomain = null;
    }
  }

  const lowerAgent = userAgent.toLowerCase();
  const browserCategory = lowerAgent.includes('chrome')
    ? 'chrome'
    : lowerAgent.includes('safari')
      ? 'safari'
      : lowerAgent.includes('firefox')
        ? 'firefox'
        : lowerAgent.includes('edge')
          ? 'edge'
          : lowerAgent.includes('bot')
            ? 'bot'
            : null;

  const userAgentCategory = lowerAgent.includes('bot')
    ? 'bot'
    : lowerAgent.includes('mobile') ||
        lowerAgent.includes('iphone') ||
        lowerAgent.includes('android')
      ? 'mobile'
      : lowerAgent.includes('tablet')
        ? 'tablet'
        : userAgent
          ? 'desktop'
          : null;

  const deviceCategory = lowerAgent.includes('bot')
    ? 'bot'
    : lowerAgent.includes('mobile') ||
        lowerAgent.includes('iphone') ||
        lowerAgent.includes('android')
      ? 'mobile'
      : lowerAgent.includes('tablet')
        ? 'tablet'
        : 'desktop';

  const referrerCategory = referrerDomain
    ? referrerDomain.includes('google.') ||
      referrerDomain.includes('bing.') ||
      referrerDomain.includes('duckduckgo.')
      ? 'search'
      : referrerDomain.includes('x.com') ||
          referrerDomain.includes('twitter.com') ||
          referrerDomain.includes('mastodon.')
        ? 'social'
        : 'direct'
    : null;

  const privacySeed = [userAgent, referrerDomain, countryCode, regionCode, requestId]
    .filter(Boolean)
    .join('|');
  const privacyHash = privacySeed ? createHash('sha256').update(privacySeed).digest('hex') : null;

  return {
    referrerDomain,
    referrerCategory,
    userAgentCategory,
    deviceCategory,
    browserCategory,
    countryCode,
    regionCode,
    privacyHash,
    requestId,
  };
}

export async function getUrlShortenerSettings(db?: Knex): Promise<UrlShortenerSettings> {
  const database = getDatabase(db);
  const rows = await database(SETTINGS)
    .select('key', 'value')
    .whereIn('key', [
      URL_SHORTENER_ROUTE_PREFIX_KEY,
      URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
      URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
    ]);

  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    routePrefix:
      (values.get(URL_SHORTENER_ROUTE_PREFIX_KEY) as string | undefined)?.trim() ||
      URL_SHORTENER_DEFAULT_PREFIX,
    publicCreationMode: publicCreationModeSchema.parse(
      (values.get(URL_SHORTENER_PUBLIC_CREATION_MODE_KEY) as string | undefined) || 'admin-only'
    ),
    legacyPrefixEnabled:
      String(values.get(URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY) ?? 'false') === 'true',
  };
}

export async function updateUrlShortenerSettings(
  input: Partial<UrlShortenerSettings>,
  db?: Knex
): Promise<UrlShortenerSettings> {
  const database = getDatabase(db);
  const now = new Date();
  const current = await getUrlShortenerSettings(database);
  const next: UrlShortenerSettings = {
    routePrefix: input.routePrefix ?? current.routePrefix,
    publicCreationMode: input.publicCreationMode ?? current.publicCreationMode,
    legacyPrefixEnabled: input.legacyPrefixEnabled ?? current.legacyPrefixEnabled,
  };

  await database.transaction(async (trx) => {
    await trx(SETTINGS)
      .insert({
        key: URL_SHORTENER_ROUTE_PREFIX_KEY,
        value: next.routePrefix,
        type: 'string',
        category: 'plugins',
        description: 'Public URL prefix for short links',
        updated_at: now,
      })
      .onConflict('key')
      .merge({ value: next.routePrefix, updated_at: now });

    await trx(SETTINGS)
      .insert({
        key: URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
        value: next.publicCreationMode,
        type: 'string',
        category: 'plugins',
        description: 'Public creation mode for short links',
        updated_at: now,
      })
      .onConflict('key')
      .merge({ value: next.publicCreationMode, updated_at: now });

    await trx(SETTINGS)
      .insert({
        key: URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
        value: next.legacyPrefixEnabled ? 'true' : 'false',
        type: 'boolean',
        category: 'plugins',
        description: 'Legacy prefix enabled',
        updated_at: now,
      })
      .onConflict('key')
      .merge({ value: next.legacyPrefixEnabled ? 'true' : 'false', updated_at: now });
  });

  return next;
}

export async function listUrlShortenerLinks(db?: Knex): Promise<UrlShortenerLink[]> {
  const database = getDatabase(db);
  const rows = (await database(LINKS)
    .whereNull('deleted_at')
    .orderBy('created_at', 'desc')) as LinkRow[];
  return rows.map(serializeLink);
}

export async function getUrlShortenerLinkByCode(
  code: string,
  db?: Knex
): Promise<UrlShortenerLink | null> {
  const database = getDatabase(db);
  const parsedCode = normalizeCode(code);
  const row = (await database(LINKS).where({ code: parsedCode }).first()) as LinkRow | undefined;
  return row ? serializeLink(row) : null;
}

export async function createUrlShortenerLink(
  input: CreateShortLinkInput,
  db?: Knex
): Promise<UrlShortenerLink> {
  const database = getDatabase(db);
  const parsed = createShortLinkInputSchema.parse({
    code: input.code,
    destinationUrl: destinationUrlSchema.parse(input.destinationUrl),
    title: input.title,
  });
  const code = parsed.code ? normalizeCode(parsed.code) : generateShortCode(parsed);
  const now = new Date();

  const [row] = (await database(LINKS)
    .insert({
      id: randomUUID(),
      code,
      destination_url: parsed.destinationUrl,
      title: parsed.title ?? null,
      is_active: true,
      expires_at: input.expiresAt ?? null,
      redirect_status_code: sanitizeRedirectStatusCode(input.redirectStatusCode),
      creator_type: input.creatorType ?? null,
      creator_id: input.creatorId ?? null,
      creator_label: input.creatorLabel ?? null,
      source_submission_id: null,
      cached_click_count: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })
    .returning('*')) as LinkRow[];

  return serializeLink(row);
}

export async function updateUrlShortenerLink(
  code: string,
  input: UpdateShortLinkInput,
  db?: Knex
): Promise<UrlShortenerLink | null> {
  const database = getDatabase(db);
  const parsedCode = normalizeCode(code);
  const now = new Date();
  const existing = (await database(LINKS).where({ code: parsedCode }).first()) as
    | LinkRow
    | undefined;
  if (!existing) {
    return null;
  }

  const [row] = (await database(LINKS)
    .where({ code: parsedCode })
    .update({
      destination_url: input.destinationUrl
        ? destinationUrlSchema.parse(input.destinationUrl)
        : existing.destination_url,
      title: input.title === undefined ? existing.title : input.title,
      redirect_status_code: sanitizeRedirectStatusCode(
        input.redirectStatusCode ?? existing.redirect_status_code
      ),
      expires_at: input.expiresAt === undefined ? existing.expires_at : input.expiresAt,
      is_active: input.isActive === undefined ? existing.is_active : input.isActive,
      updated_at: now,
    })
    .returning('*')) as LinkRow[];

  return serializeLink(row);
}

export async function disableUrlShortenerLink(
  code: string,
  db?: Knex
): Promise<UrlShortenerLink | null> {
  return updateUrlShortenerLink(code, { isActive: false }, db);
}

export async function deleteUrlShortenerLink(
  code: string,
  db?: Knex
): Promise<UrlShortenerLink | null> {
  const database = getDatabase(db);
  const parsedCode = normalizeCode(code);
  const now = new Date();
  const existing = (await database(LINKS).where({ code: parsedCode }).first()) as
    | LinkRow
    | undefined;
  if (!existing) {
    return null;
  }

  const [row] = (await database(LINKS)
    .where({ code: parsedCode })
    .update({ is_active: false, deleted_at: now, updated_at: now })
    .returning('*')) as LinkRow[];

  return serializeLink(row);
}

export async function getUrlShortenerOverview(db?: Knex): Promise<UrlShortenerOverview> {
  const database = getDatabase(db);
  const links = await database(LINKS).select('is_active', 'expires_at', 'deleted_at');
  const activeLinks = links.filter((row) => Boolean(row.is_active) && !row.deleted_at).length;
  const disabledLinks = links.filter((row) => !Boolean(row.is_active) && !row.deleted_at).length;
  const expiredLinks = links.filter(
    (row) => row.expires_at && new Date(row.expires_at).getTime() <= Date.now()
  ).length;

  const clickRow = await database(CLICKS).count<{ count: string }[]>({ count: '*' }).first();
  const dailyRows = (await database(DAILY)
    .select('stat_date')
    .sum<{ total: string }[]>({ total: 'total_clicks' })
    .groupBy('stat_date')
    .orderBy('stat_date', 'desc')
    .limit(7)) as Array<{ stat_date: Date | string; total: string | number }>;

  return {
    totalLinks: links.length,
    activeLinks,
    disabledLinks,
    expiredLinks,
    totalClicks: toNumber(clickRow?.count ?? 0),
    recentDailyClicks: dailyRows
      .map((row) => ({ date: toIso(row.stat_date).slice(0, 10), totalClicks: toNumber(row.total) }))
      .reverse(),
  };
}

export async function recordUrlShortenerClick(
  linkId: string,
  request: Request,
  db?: Knex
): Promise<void> {
  const database = getDatabase(db);
  const now = new Date();
  const signals = getRequestSignals(request);
  const today = now.toISOString().slice(0, 10);

  await database.transaction(async (trx) => {
    await trx(CLICKS).insert({
      id: randomUUID(),
      link_id: linkId,
      clicked_at: now,
      referrer_domain: signals.referrerDomain,
      referrer_category: signals.referrerCategory,
      user_agent_category: signals.userAgentCategory,
      device_category: signals.deviceCategory,
      browser_category: signals.browserCategory,
      country_code: signals.countryCode,
      region_code: signals.regionCode,
      privacy_hash: signals.privacyHash,
      request_id: signals.requestId,
    });

    await trx(LINKS)
      .where({ id: linkId })
      .increment({ cached_click_count: 1 })
      .update({ updated_at: now });

    const incrementBy = signals.privacyHash ? 1 : 0;
    const applyDailyAggregateUpdate = async (): Promise<number> => {
      return trx(DAILY)
        .where({
          link_id: linkId,
          stat_date: today,
        })
        .whereRaw('referrer_category is not distinct from ?', [signals.referrerCategory])
        .whereRaw('device_category is not distinct from ?', [signals.deviceCategory])
        .whereRaw('browser_category is not distinct from ?', [signals.browserCategory])
        .increment({
          total_clicks: 1,
          unique_clicks_approx: incrementBy,
        })
        .update({ updated_at: now });
    };

    const updatedRows = await applyDailyAggregateUpdate();
    if (updatedRows > 0) {
      return;
    }

    try {
      await trx(DAILY).insert({
        id: randomUUID(),
        link_id: linkId,
        stat_date: today,
        total_clicks: 1,
        unique_clicks_approx: incrementBy,
        referrer_category: signals.referrerCategory,
        device_category: signals.deviceCategory,
        browser_category: signals.browserCategory,
        created_at: now,
        updated_at: now,
      });
    } catch (error) {
      if (!isUniqueViolationError(error)) {
        throw error;
      }

      const retriedRows = await applyDailyAggregateUpdate();
      if (retriedRows === 0) {
        throw new Error(
          `Daily aggregate update retry did not match any row for link ${linkId} on ${today}`
        );
      }
    }
  });
}
