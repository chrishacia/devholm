/**
 * Reserved routes - routes that plugins cannot claim
 *
 * Built from:
 * 1. Actual filesystem-owned routes from app structure
 * 2. Framework-owned roots (admin, API, auth, etc.)
 * 3. Internal infrastructure (_next, .well-known, etc.)
 * 4. Developer-defined pages that should be protected
 *
 * Plugins must not claim these paths
 */

import { devPageDefinitions } from '@user/extensions/pages';

/**
 * Get reserved routes set
 * Combines filesystem routes, framework routes, and dev pages
 */
export function getReservedRoutes(): Set<string> {
  const reserved = new Set<string>();

  // Core Next.js infrastructure routes
  reserved.add('/_next');
  reserved.add('/.well-known');
  reserved.add('/favicon.ico');
  reserved.add('/robots.txt');
  reserved.add('/sitemap.xml');

  // Framework routes that must be protected
  reserved.add('/');
  reserved.add('/admin');
  reserved.add('/api');
  reserved.add('/auth');
  reserved.add('/invite');
  reserved.add('/public');
  reserved.add('/static');
  reserved.add('/uploads');

  // Actual filesystem-owned dev pages from app structure
  // These come from the app directory and cannot be overridden
  const filesystemPages = [
    '/about',
    '/blog',
    '/calendar',
    '/contact',
    '/gallery',
    '/now',
    '/projects',
    '/resume',
    '/search',
    '/uses',
  ];
  filesystemPages.forEach((page) => reserved.add(page));

  // Dynamic developer page definitions (if any configured)
  devPageDefinitions.forEach((page) => {
    reserved.add(page.path);
  });

  return reserved;
}
