/**
 * Compatibility shim for the legacy telemetry migration filename.
 *
 * Older installations recorded this filename in knex_migrations before the
 * telemetry migration moved into the user extension layer. Keeping a no-op file
 * here prevents production migration state from being treated as corrupt while
 * newer installs continue to use the user-layer migration implementation.
 */

export async function up(): Promise<void> {
  // Intentionally empty.
}

export async function down(): Promise<void> {
  // Intentionally empty.
}
