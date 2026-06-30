/**
 * DevHolm Configuration Type
 * ==========================
 *
 * The DevHolmConfig interface is the single contract between the framework
 * engine and the user's application layer.
 *
 * Users fill in devholm.config.ts (at the project root) to wire their
 * theme, content, extensions, and feature flags to the framework.
 */

import type { Theme } from '@mui/material/styles';
import type { AboutContent, HomeContent, NowContent, ProjectsContent } from './content';
import type { SlotsConfig, AdminExtension, ViewOverride } from './extensions';

// =============================================================================
// Feature Flags
// =============================================================================

export interface FeaturesConfig {
  /** Generate /rss.xml feed */
  rss: boolean;
  /** Enable site-wide search (/search) */
  search: boolean;
  /** Enable analytics tracking */
  analytics: boolean;
  /** Enable /contact page and form */
  contactForm: boolean;
  /** Enable blog post series grouping */
  blogSeries: boolean;
  /** Enable /resume page */
  resumePage: boolean;
  /** Enable /projects page */
  projectsPage: boolean;
  /** Enable /uses page */
  usesPage: boolean;
  /** Enable /now page */
  nowPage: boolean;
}

// =============================================================================
// Root Config Interface
// =============================================================================

export interface DevHolmConfig {
  /**
   * Your MUI theme creator function.
   * Receives the current color mode ('light' | 'dark') and returns a Theme.
   *
   * @example
   * import { createTheme } from '@mui/material/styles';
   * theme: (mode) => createTheme({ palette: { mode, primary: { main: '#0969DA' } } })
   */
  theme?: (mode: 'light' | 'dark') => Theme;

  /**
   * Personal content for narrative pages.
   * Edit the files in src/user/content/ and wire them here.
   *
   * @example
   * import { aboutContent } from './src/user/content/about';
   * content: { about: aboutContent }
   */
  content?: {
    about?: AboutContent;
    home?: HomeContent;
    now?: NowContent;
    projects?: ProjectsContent;
  };

  /**
   * Inject React components into named slots within core page views.
   * All slot names are typed — TypeScript will error on invalid names.
   *
   * @example
   * slots: {
   *   'blog.sidebar.bottom': MyNewsletterSignup,
   *   'home.hero.below': MyAnnouncementBanner,
   * }
   */
  slots?: SlotsConfig;

  /**
   * Override core page views with your own after running `pnpm devholm eject <view>`.
   *
   * @example
   * views: {
   *   blog: () => import('./src/user/views/blog/BlogView'),
   * }
   */
  views?: ViewOverride;

  /**
   * Register custom admin nav items.
   *
   * The page implementation for a custom href lives in
   * src/user/extensions/admin/pages.tsx.
   * Custom API handlers live in src/user/extensions/api/index.ts.
   */
  extensions?: {
    /** Custom admin nav items */
    admin?: AdminExtension[];
  };

  /**
   * Enable or disable core framework features.
   * Omitted features use their default values (all true by default).
   */
  features?: Partial<FeaturesConfig>;
}
