/**
 * Read-only database accessor for match phase
 * Prevents write operations during side-effect-free matching
 */
export interface ReadOnlyDatabaseAccessor {
  /** Execute read-only queries only */
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
  /** Select builder - read-only operations only */
  selectFrom(table: string): unknown;
}

/**
 * Read-only settings accessor for match phase
 */
export interface ReadOnlySettingsAccessor {
  /** Get a site setting by key */
  get(key: string): Promise<string | null>;
  /** Get all site settings */
  getAll(): Promise<Record<string, string>>;
}

/**
 * Narrowed context for public route matching
 * Restricted to read-only operations during match phase
 *
 * This interface ensures that matchers cannot perform mutations
 * or side effects during the collection phase.
 */
export interface PublicRouteMatchContext {
  /** Reserved routes that cannot be claimed by plugins */
  readonly reservedRoutes: ReadonlySet<string>;
  /** Read-only database access during matching */
  readonly db: ReadOnlyDatabaseAccessor;
  /** Read-only settings access during matching */
  readonly settings: ReadOnlySettingsAccessor;
}
