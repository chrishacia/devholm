/**
 * DevHolm Configuration
 * =====================
 *
 * This is YOUR configuration file. The framework reads from it to wire
 * your theme, content, extensions, and feature flags to the engine.
 *
 * This file is never modified by upstream DevHolm updates.
 * When you run `git merge upstream/main`, this file is untouched.
 *
 * ─────────────────────────────────────────────────────────────────
 *  GETTING STARTED
 * ─────────────────────────────────────────────────────────────────
 *  1. Theme      → customize src/user/theme/theme.ts, then uncomment below
 *  2. Content    → fill in src/user/content/*.ts files, then uncomment below
 *  3. Extensions → add custom admin pages to src/user/extensions/admin/
 *  4. Slots      → inject components into named page slots (see SlotName type)
 *  5. Views      → run `pnpm devholm eject <view>` to override a core page
 * ─────────────────────────────────────────────────────────────────
 */

import type { DevHolmConfig } from './src/core/types/config';

// ── Uncomment as you set up each section ──────────────────────────

// Phase 1: Theme (after creating src/user/theme/theme.ts)
// import { getTheme } from './src/user/theme/theme';

// Phase 1: Content
import { aboutContent } from './src/user/content/about';
import { homeContent } from './src/user/content/home';
import { nowContent } from './src/user/content/now';

// Phase 3: Admin Extensions (after editing src/user/extensions/admin/index.tsx)
// import { adminExtensions } from './src/user/extensions/admin';

// ─────────────────────────────────────────────────────────────────

const config: DevHolmConfig = {
  // theme: getTheme,

  content: {
    about: aboutContent,
    home: homeContent,
    now: nowContent,
  },

  /**
   * Extension Slots
   * Register React components to inject into named slots in core pages.
   * All slot names are typed — invalid names are caught by TypeScript.
   *
   * @see SlotName for all available slot names
   *
   * @example
   * slots: {
   *   'blog.sidebar.bottom': MyNewsletterWidget,
   *   'home.hero.below': MyAnnouncementBanner,
   * },
   */
  slots: {},

  /**
   * View Overrides
   * After running `pnpm devholm eject <view>`, register your override here.
   *
   * @example
   * views: {
   *   blog: () => import('./src/user/views/blog/BlogView'),
   * },
   */
  views: {},

  extensions: {
    // admin: adminExtensions,
    admin: [],
  },

  /**
   * Feature Flags
   * Set any to false to disable that feature across the entire site.
   */
  features: {
    rss: true,
    search: true,
    analytics: true,
    contactForm: true,
    blogSeries: true,
    resumePage: true,
    projectsPage: true,
    usesPage: true,
    nowPage: true,
  },
};

export default config;
