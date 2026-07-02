/**
 * Real Read-Only Settings Adapter
 *
 * Provides actual settings access for the match phase.
 * This replaces type assertions with real function wrapping.
 */

import type { ReadOnlySettingsAccessor } from '@core/lib/public-route-match-context.server';

/**
 * Create a real read-only settings accessor
 * Only allows reading from site_settings via the settings DB layer
 *
 * Phase 1: Match context is settings-only for security and simplicity.
 * Plugins needing additional data should implement their own
 * read repositories and inject them internally.
 */
export function createReadOnlySettingsAccessor(
  getSetting: (key: string) => Promise<unknown>,
  getSettings: (keys: string[]) => Promise<Record<string, unknown>>
): ReadOnlySettingsAccessor {
  return {
    /**
     * Get a single site setting by key
     */
    async get(key: string): Promise<unknown> {
      try {
        return await getSetting(key);
      } catch (error) {
        throw new Error(
          `Failed to read site setting "${key}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    /**
     * Get multiple site settings by keys
     */
    async getMany(keys: readonly string[]): Promise<Record<string, unknown>> {
      try {
        return await getSettings(Array.from(keys));
      } catch (error) {
        throw new Error(
          `Failed to read site settings: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  };
}
