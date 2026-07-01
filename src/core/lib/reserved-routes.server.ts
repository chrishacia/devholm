/**
 * Reserved routes - routes that plugins cannot claim
 *
 * Built from:
 * 1. Core Next.js infrastructure routes
 * 2. Framework routes (admin, API)
 * 3. Developer page definitions (from devPageDefinitions)
 *
 * Plugins must not claim these paths
 */

/**
 * Get reserved routes set
 * Combines hardcoded core routes with developer page definitions
 */
export function getReservedRoutes(): Set<string> {
  const reserved = new Set<string>();

  // Core Next.js infrastructure routes
  reserved.add('/admin');
  reserved.add('/api');
  reserved.add('/static');
  reserved.add('/_next');
  reserved.add('/public');
  reserved.add('/.well-known');

  // Developer page definitions
  // These are read-only routes that must be protected from plugin override
  // In a real implementation, these would come from devPageDefinitions config
  // For now, hardcoded as a placeholder
  const devPages = ['/blog', '/calendar', '/gallery', '/about', '/projects', '/resume', '/contact'];
  devPages.forEach((page) => reserved.add(page));

  return reserved;
}
