/**
 * Compatibility shim for the legacy telemetry migration filename.
 *
 * Older installations recorded this filename in knex_migrations before the
 * telemetry migration moved into the user extension layer. Keeping a no-op file
 * here prevents production migration state from being treated as corrupt while
 * newer installs continue to use the user-layer migration implementation.
 */

import type { Knex } from 'knex';

export async function up(_knex: Knex): Promise<void> {
  // Intentionally empty.
}

export async function down(_knex: Knex): Promise<void> {
  // Intentionally empty.
}