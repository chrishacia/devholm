/**
 * DevHolm Extension Types
 * =======================
 *
 * Types for the extension system: admin extensions, extension slots,
 * and view overrides.
 *
 * These are the contracts that src/user/extensions/ and devholm.config.ts
 * must satisfy.
 */

import type React from 'react';

// =============================================================================
// Extension Slots
// =============================================================================

/**
 * All named injection points in core page views.
 * Only these slot names are valid in devholm.config.ts → slots.
 */
export type SlotName =
  | 'home.hero.below'
  | 'home.sidebar.top'
  | 'home.sidebar.bottom'
  | 'home.below'
  | 'blog.aboveList'
  | 'blog.belowList'
  | 'blog.sidebar.top'
  | 'blog.sidebar.bottom'
  | 'blog.post.aboveContent'
  | 'blog.post.belowContent'
  | 'blog.post.sidebar'
  | 'projects.aboveList'
  | 'projects.belowList'
  | 'resume.top'
  | 'resume.bottom'
  | 'admin.dashboard.top'
  | 'admin.dashboard.bottom';

/** Map of slot names to React components. Only registered slots render; others are no-ops. */
export type SlotsConfig = Partial<Record<SlotName, React.ComponentType>>;

// =============================================================================
// Admin Extensions
// =============================================================================

/**
 * Position hint for where to insert a custom nav item in the admin sidebar.
 * Use 'after:<item-href-segment>' to insert after a core nav item.
 *
 * @example 'after:analytics'  → inserts after the Analytics nav item
 * @example 'after:media'      → inserts after the Media nav item
 */
export type AdminNavPosition = 'before:dashboard' | `after:${string}`;

export interface AdminNavItem {
  /** Display label in the sidebar */
  label: string;
  /** Route href, e.g. '/admin/telemetry' */
  href: string;
  /**
   * MUI icon component.
   * @example import { SatelliteAlt } from '@mui/icons-material'
   */
  icon: React.ReactNode;
  /** Where to insert this item relative to core nav items */
  position?: AdminNavPosition;
}

export interface AdminExtension {
  pluginId?: string;
  navItem: AdminNavItem;
}

// =============================================================================
// View Overrides
// =============================================================================

/**
 * Core view names that can be overridden via `pnpm devholm eject <view>`.
 * Each view corresponds to a file in src/core/views/<view>/.
 */
export type ViewName =
  | 'blog'
  | 'blog-post'
  | 'projects'
  | 'resume'
  | 'uses'
  | 'search'
  | 'contact'
  | 'home'
  | 'about'
  | 'now';

/**
 * Map of view names to dynamic import functions returning the override component.
 * Use after running `pnpm devholm eject <view>`.
 *
 * @example
 * views: {
 *   blog: () => import('./src/user/views/blog/BlogView'),
 * }
 */
export type ViewOverride = Partial<
  Record<ViewName, () => Promise<{ default: React.ComponentType }>>
>;
