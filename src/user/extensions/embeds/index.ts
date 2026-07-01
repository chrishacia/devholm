/**
 * Embed extensions registry
 *
 * Combines core embeds (calendar, gallery) with plugin embeds.
 * Extensions are processed in order; first match wins.
 *
 * Example plugin embed (Phase 2 - URL Shortener):
 *
 * const urlShortenerEmbeds: EmbedExtensionConfig[] = [
 *   {
 *     pluginId: 'url-shortener',
 *     id: 'shorturl-stats-embed',
 *     pattern: /^\[shorturl-stats\s+([^\]]+)\]$/,
 *     render: async (match, content, helpers) => {
 *       const code = match[1];
 *       const db = helpers.getDb();
 *       const shortUrl = await db.selectFrom('shortUrls')
 *         .select(['id', 'code', 'clicks', 'createdAt'])
 *         .where('code', '=', code)
 *         .executeTakeFirst();
 *
 *       if (!shortUrl) {
 *         return `<div class="embed-error">Short URL '${escapeHtml(code)}' not found.</div>`;
 *       }
 *
 *       return `<section class="devholm-embed shorturl-stats">
 *         <h4>${escapeHtml(code)}</h4>
 *         <p>Clicks: ${shortUrl.clicks}</p>
 *       </section>`;
 *     },
 *   },
 * ];
 */

import type { EmbedExtensionConfig } from '@core/types/extensions.server';
import { calendarEmbeds } from '@core/lib/embeds/calendar';
import { galleryEmbeds } from '@core/lib/embeds/gallery';

// Plugin embeds registry (empty for now, populated in Phase 2+)
const pluginEmbeds: EmbedExtensionConfig[] = [];

/**
 * Combined registry of all embed extensions
 * Order matters: first matching pattern wins
 */
export const embedExtensions: EmbedExtensionConfig[] = [
  ...calendarEmbeds,
  ...galleryEmbeds,
  ...pluginEmbeds,
];
