/**
 * DevHolm Core View Prop Types
 * ============================
 *
 * Prop interfaces for all core page views.
 * These are used by both the core view implementations and any user view
 * overrides (after `pnpm devholm eject <view>`).
 *
 * When a user ejects a view, their component must satisfy the same props
 * interface as the core view it replaces.
 */

import type { SiteSettings } from '@/hooks/useSiteSettings';
import type { PostWithTags, Tag } from '@/db/posts';
import type { AboutContent, HomeContent, NowContent } from './content';

// =============================================================================
// Home View
// =============================================================================

export interface FeaturedPost {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  publishedAt: string | Date | null;
  tags: Array<{ id: string; name: string; slug: string }>;
}

export interface TagWithCount extends Tag {
  postCount: number;
}

export interface HomeViewProps {
  settings: SiteSettings;
  initialPosts: FeaturedPost[];
  initialTags: TagWithCount[];
  content: HomeContent;
}

// =============================================================================
// About View
// =============================================================================

export interface AboutViewProps {
  settings: SiteSettings;
  content: AboutContent;
}

// =============================================================================
// Now View
// =============================================================================

export interface NowViewProps {
  content: NowContent;
}

// =============================================================================
// Blog Views
// =============================================================================

export interface BlogListViewProps {
  initialPosts: PostWithTags[];
  initialTotalPages: number;
  initialTotalPosts: number;
  initialTags: TagWithCount[];
}

export interface BlogPostViewProps {
  // defined when blog post view is migrated in Phase 2
  [key: string]: unknown;
}

// =============================================================================
// Projects View
// =============================================================================

export interface ProjectItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  image_url: string | null;
  github_url: string | null;
  live_url: string | null;
  is_featured: boolean;
  technologies: string[];
}

export interface ProjectsViewProps {
  projects: ProjectItem[];
}

// =============================================================================
// Other Views (props defined in Phase 2)
// =============================================================================

export type ResumeViewProps = Record<string, unknown>;
export type UsesViewProps = Record<string, unknown>;
export type SearchViewProps = Record<string, unknown>;
export type ContactViewProps = Record<string, unknown>;
