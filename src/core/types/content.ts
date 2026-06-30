/**
 * DevHolm Content Types
 * =====================
 *
 * Type contracts for narrative page content files.
 * These are the shapes that src/user/content/*.ts files must satisfy.
 *
 * Narrative pages (about, home, now) use these types so that the framework
 * can read user-authored content at render time without the user modifying
 * any core layout components.
 */

import type React from 'react';

// =============================================================================
// Shared Types
// =============================================================================

export type SkillCategory = 'frontend' | 'backend' | 'devops' | 'tools' | 'other';

export interface Skill {
  name: string;
  category: SkillCategory;
}

export interface Interest {
  /** MUI icon component (e.g. import { Code } from '@mui/icons-material') */
  icon: React.ElementType;
  label: string;
}

// =============================================================================
// About Page Content
// =============================================================================

export interface AboutContent {
  /** Displayed under the author name, e.g. "Software Engineer • Gamer • Father" */
  tagline: string;
  /** Array of paragraph strings for the intro section */
  intro: string[];
  /** Array of paragraph strings for the "My Journey" section */
  story: string[];
  /** Skills displayed as chips in the Skills section */
  skills: Skill[];
  /** Interests displayed as icon cards */
  interests: Interest[];
}

// =============================================================================
// Home Page Content
// =============================================================================

export interface HomeContent {
  /**
   * Tagline in the hero section, below the author name greeting.
   * e.g. "Full-stack developer crafting digital experiences..."
   */
  heroTagline: string;
  /** Short blurb in the right sidebar "About" widget */
  sidebarAboutText: string;
}

// =============================================================================
// Projects Page Content
// =============================================================================

export interface ProjectsContent {
  /** Subheading below the "Projects" title */
  tagline: string;
}

// =============================================================================
// Now Page Content
// =============================================================================

export interface NowSection {
  /** MUI icon component */
  icon: React.ElementType;
  title: string;
  items: string[];
}

export interface NowTechStack {
  [category: string]: string[];
}

export interface NowCurrentProject {
  name: string;
  tagline: string;
  description: string;
  features: string[];
  techStack: NowTechStack;
}

export interface NowContent {
  /** When this page was last updated — shown in the page header */
  lastUpdated: Date;
  /** e.g. "Working remotely from California" */
  location: string;
  /** The main project / focus area */
  currentProject: NowCurrentProject;
  /** Sectioned lists of current activities */
  sections: NowSection[];
  /** Focus tags displayed at the bottom */
  focus: string[];
}
