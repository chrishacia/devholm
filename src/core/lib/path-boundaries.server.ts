/**
 * Path boundary utilities for consistent path matching
 *
 * Prevents false positives like:
 * - /apiary matching /api
 * - /admin-panel matching /admin
 * - /static-site matching /static
 */

/**
 * Check if a pathname is within a root path with proper boundaries.
 *
 * Returns true if pathname equals root OR pathname starts with root followed by /.
 * Returns false for similar-sounding paths like /apiary for /api.
 *
 * @param pathname - The pathname to check (e.g., /api/users, /apiary)
 * @param root - The root path to match (e.g., /api)
 * @returns true if pathname is within the root boundary
 */
export function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * Check if pathname is an API route (starts with /api with boundary)
 */
export function isApiPath(pathname: string): boolean {
  return isPathWithin(pathname, '/api');
}

/**
 * Check if pathname is an admin route (starts with /admin with boundary)
 */
export function isAdminPath(pathname: string): boolean {
  return isPathWithin(pathname, '/admin');
}

/**
 * Check if pathname is a static path (starts with /static with boundary)
 */
export function isStaticPath(pathname: string): boolean {
  return isPathWithin(pathname, '/static');
}
