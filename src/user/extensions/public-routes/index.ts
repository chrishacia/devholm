/**
 * Public route extensions registry
 *
 * Plugins can register public route handlers here to claim URL paths
 * and return custom responses (e.g., redirects, dynamic pages).
 *
 * Example URL Shortener plugin (Phase 2):
 *
 * export const publicRouteExtensions: PublicRouteExtension[] = [
 *   {
 *     pluginId: 'url-shortener',
 *     id: 'url-shortener-redirect',
 *     claimPath: async (pathname, request, helpers) => {
 *       // Check if URL shortener is enabled
 *       if (!(await isPluginEnabled('url-shortener'))) {
 *         return null;
 *       }
 *
 *       // Try to resolve the shortcode from database
 *       const shortcode = pathname.slice(1); // Remove leading '/'
 *       const shortUrl = await db.shortUrls.findOne({ code: shortcode });
 *       if (!shortUrl) {
 *         return null; // Not a shortcode, let other handlers try
 *       }
 *
 *       // Record analytics, then redirect
 *       await recordShortUrlClick(shortUrl.id);
 *       return Response.redirect(shortUrl.targetUrl, 302);
 *     },
 *   },
 * ];
 */

import type { PublicRouteExtension } from '@core/types/extensions.server';
import { calendarPublicRouteExtension } from '@user/extensions/plugins/calendar/public-routes/calendar-public-route.server';
import { urlShortenerPublicRouteExtension } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-public-route.server';

// Keep middleware/public-route loading Edge-safe by importing only route declarations.
// Avoid importing full bundled plugin modules here because they include server-only
// admin/API modules that pull Node-only dependencies into the middleware graph.
export const publicRouteExtensions: PublicRouteExtension[] = [
  calendarPublicRouteExtension,
  urlShortenerPublicRouteExtension,
];
