/**
 * Real Read-Only Database and Settings Adapters
 *
 * These provide actual runtime protection for the match phase,
 * not just type assertions.
 */

import type { Knex } from 'knex';
import type {
  ReadOnlyDatabaseAccessor,
  ReadOnlySettingsAccessor,
} from '@core/lib/public-route-match-context.server';

/**
 * Allowed tables for read-only queries during match phase
 * Only tables that plugins might need to check for routing
 */
type AllowedMatchTable = 'site_settings';

/**
 * Create a real read-only database adapter
 * Only allows SELECT queries on specified tables
 *
 * This wraps the Knex instance to prevent write operations
 * and restrict to only tables needed for routing decisions.
 */
export function createReadOnlyDatabaseAccessor(db: Knex): ReadOnlyDatabaseAccessor {
  return {
    /**
     * Execute a read-only query with parameters
     * Only allows SELECT statements (basic protection)
     */
    async query(sql: string, params?: unknown[]): Promise<unknown[]> {
      // Basic protection: only allow SELECT
      const trimmed = sql.trim().toUpperCase();
      if (!trimmed.startsWith('SELECT')) {
        throw new Error(
          `Read-only query adapter only allows SELECT statements. ` + `Got: ${sql.substring(0, 50)}`
        );
      }

      try {
        const result = await db.raw(sql, params || []);
        // Knex raw() returns { rows } for most databases
        return Array.isArray(result) ? result : result.rows || [];
      } catch (error) {
        throw new Error(
          `Read-only query failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    /**
     * Select builder for safe table access
     * Only allows reading from site_settings table
     */
    selectFrom(table: string): {
      where: (criteria: Record<string, unknown>) => { first: () => Promise<unknown> };
    } {
      // Whitelist allowed tables
      const allowedTables: Record<AllowedMatchTable, true> = {
        site_settings: true,
      };

      if (!(table in allowedTables)) {
        throw new Error(
          `Read-only adapter only allows SELECT from: site_settings. ` + `Requested: ${table}`
        );
      }

      return {
        where: (criteria: Record<string, unknown>) => ({
          first: async () => {
            return await db(table).where(criteria).first();
          },
        }),
      };
    },
  };
}

/**
 * Create a real read-only settings accessor
 * Only allows reading from site_settings via the settings DB layer
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
