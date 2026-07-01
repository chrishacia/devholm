/**
 * Read-only settings accessor for match phase
 * Only reads from site_settings via DB layer
 */
export interface ReadOnlySettingsAccessor {
  /** Get a single site setting by key */
  get(key: string): Promise<unknown>;
  /** Get multiple site settings by keys */
  getMany(keys: readonly string[]): Promise<Record<string, unknown>>;
}

/**
 * Narrowed context for public route matching
 * Restricted to read-only settings operations during match phase
 *
 * Phase 1 limitation: Settings-only access during match phase.
 * This ensures matchers cannot perform arbitrary database queries
 * or side effects during the collection phase.
 *
 * If plugins need table access, they should expose their own
 * narrow read repositories internally, not through match context.
 */
export interface PublicRouteMatchContext {
  /** Reserved routes that cannot be claimed by plugins */
  readonly reservedRoutes: ReadonlySet<string>;
  /** Read-only settings access during matching */
  readonly settings: ReadOnlySettingsAccessor;
}
