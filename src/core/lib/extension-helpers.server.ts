/**
 * Extension helper factory - focused module for constructing ExtensionHelpers
 *
 * This module does NOT import:
 * - Admin page registries
 * - API extension registries
 * - SEO registries
 * - Public-route dispatchers
 * - User admin pages
 *
 * Used by both general extension module and public-route dispatcher
 */

import type { ExtensionHelpers } from '@core/types/extensions.server';
import { auth } from '@/auth';
import { getDb } from '@/db';
import { verifyAdmin } from '@/lib/auth-helpers';

/**
 * Create extension helpers for runtime access
 * Lazy-loads database, auth, and admin verification
 */
export function createExtensionHelpers(): ExtensionHelpers {
  return {
    auth,
    getDb,
    verifyAdmin,
  };
}

/**
 * Get helpers (singleton pattern for middleware)
 * Cached at module level to avoid repeated factory calls
 */
let cachedHelpers: ExtensionHelpers | null = null;

export function getExtensionHelpers(): ExtensionHelpers {
  if (!cachedHelpers) {
    cachedHelpers = createExtensionHelpers();
  }
  return cachedHelpers;
}
