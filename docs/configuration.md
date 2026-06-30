# Configuration Reference

All user configuration lives in `devholm.config.ts` at the project root. This file is never overwritten by framework updates.

## Full config shape

```typescript
import type { DevHolmConfig } from './src/core/types/config';

const config: DevHolmConfig = {
  // ── Content ──────────────────────────────────────────────────────────────
  content: {
    about: aboutContent, // AboutContent — bio, skills, interests
    home: homeContent, // HomeContent  — hero tagline, sidebar text
    now: nowContent, // NowContent   — current project, location, focus
  },

  // ── Extension Slots ───────────────────────────────────────────────────────
  // React components injected into named positions in core views.
  // See: pnpm devholm list:slots
  slots: {
    'home.hero.below': MyHeroBanner,
    'blog.sidebar.top': NewsletterWidget,
  },

  // ── View Overrides ────────────────────────────────────────────────────────
  // After running: pnpm devholm eject <view>
  views: {
    about: () => import('./src/user/views/about/AboutView').then((m) => m.default),
  },

  // ── Admin Extensions ──────────────────────────────────────────────────────
  extensions: {
    admin: adminExtensions, // AdminExtension[] from src/user/extensions/admin/index.tsx
  },

  // ── Feature Flags ─────────────────────────────────────────────────────────
  features: {
    blog: true,
    projects: true,
    resume: true,
    uses: true,
    contact: true,
    search: true,
    now: true,
    about: true,
  },
};

export default config;
```

## Content types

### `AboutContent`

```typescript
interface AboutContent {
  tagline: string; // Displayed as page subtitle
  intro: string; // First paragraph
  story: string; // Longer narrative
  skills: string[]; // Shown as chips
  interests: InterestItem[]; // Icon + label grid
}
```

### `HomeContent`

```typescript
interface HomeContent {
  heroTagline: string; // Large gradient heading on homepage
  sidebarAboutText: string; // About widget text in right sidebar
}
```

### `NowContent`

```typescript
interface NowContent {
  lastUpdated: Date;
  location: string;
  currentProject: {
    name: string;
    description: string;
    techStack: string[];
    features: string[];
    icon: React.ReactNode;
  };
  sections: NowSection[];
  focus: string[];
}
```

## Environment variables

The `src/core/config/env.ts` file reads these `NEXT_PUBLIC_` variables at build time:

| Variable                       | Default                 | Description         |
| ------------------------------ | ----------------------- | ------------------- |
| `NEXT_PUBLIC_APP_URL`          | `http://localhost:3000` | Site URL            |
| `NEXT_PUBLIC_SITE_NAME`        | `My Site`               | Site name           |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | `A personal website`    | Site description    |
| `NEXT_PUBLIC_AUTHOR_NAME`      | `Your Name`             | Author's full name  |
| `NEXT_PUBLIC_AUTHOR_EMAIL`     | `you@example.com`       | Author email        |
| `NEXT_PUBLIC_AUTHOR_URL`       | `https://example.com`   | Author personal URL |
| `NEXT_PUBLIC_SOCIAL_TWITTER`   | `''`                    | Twitter handle      |
| `NEXT_PUBLIC_SOCIAL_GITHUB`    | `''`                    | GitHub username     |
| `NEXT_PUBLIC_SOCIAL_LINKEDIN`  | `''`                    | LinkedIn username   |
