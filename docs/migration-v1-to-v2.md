# Migrating from DevHolm v1.0.0 to v2.0.0

This document covers every breaking change introduced in v2.0.0 and the exact steps required to upgrade an existing v1.0.0 installation.

---

## Overview of Breaking Changes

| Area | v1.0.0 | v2.0.0 |
|------|--------|--------|
| Source layout | `src/components/`, `src/lib/`, etc. | `src/core/components/`, `src/core/lib/`, etc. |
| User content | Scattered in components / hardcoded | `src/user/content/*.ts` |
| Page logic | `*PageClient.tsx` per page | `src/core/views/*View.tsx` |
| Site config | `src/config/site.ts` | `devholm.config.ts` at root |
| Admin nav items | Hardcoded in `AdminLayoutClient.tsx` | `src/user/extensions/admin/index.tsx` |
| DB migrations | Single `src/db/migrations/` dir | Array: `src/core/db/migrations/` + `src/user/extensions/db/migrations/` |
| Path aliases | `@/components/*`, `@/lib/*`, etc. | Same aliases preserved + new `@core/*`, `@user/*`, `@config` |

---

## Step-by-Step Upgrade Guide

### 1. Upgrade your pnpm and ensure Node.js v20+

```bash
node --version   # must be >= 20
pnpm --version   # must be >= 9
```

### 2. Update your dependencies

Replace your `package.json` `dependencies` and `devDependencies` with the pinned versions from the v2.0.0 release, or run:

```bash
pnpm install
```

The lock file ships with the release and contains every exact version tested against.

### 3. Rename the source directories

> **Warning:** This is the largest change. Back up your work before proceeding.

```bash
# From the project root
mkdir -p src/core

# Move framework directories under src/core/
mv src/components  src/core/components
mv src/lib         src/core/lib
mv src/hooks       src/core/hooks
mv src/db          src/core/db
mv src/config      src/core/config
mv src/theme       src/core/theme

# src/types → src/core/types_app (avoids conflict with new framework types)
mv src/types       src/core/types_app
```

### 4. Update `tsconfig.json` path aliases

Replace the path aliases section with:

```json
{
  "compilerOptions": {
    "paths": {
      "@/components/*": ["./src/core/components/*"],
      "@/lib/*": ["./src/core/lib/*"],
      "@/hooks/*": ["./src/core/hooks/*"],
      "@/db/*": ["./src/core/db/*"],
      "@/config": ["./src/core/config/index"],
      "@/config/*": ["./src/core/config/*"],
      "@/theme/*": ["./src/core/theme/*"],
      "@/types": ["./src/core/types_app/index"],
      "@/types/*": ["./src/core/types_app/*"],
      "@/*": ["./src/*"],
      "@core/*": ["./src/core/*"],
      "@user/*": ["./src/user/*"],
      "@config": ["./devholm.config"]
    }
  }
}
```

### 5. Update `vitest.config.ts` aliases

Add the same overrides to your vitest config's `resolve.alias`:

```ts
resolve: {
  alias: [
    { find: /^@\/components\/(.*)/, replacement: path.resolve(__dirname, 'src/core/components/$1') },
    { find: /^@\/lib\/(.*)/, replacement: path.resolve(__dirname, 'src/core/lib/$1') },
    { find: /^@\/hooks\/(.*)/, replacement: path.resolve(__dirname, 'src/core/hooks/$1') },
    { find: /^@\/db\/(.*)/, replacement: path.resolve(__dirname, 'src/core/db/$1') },
    { find: /^@\/config$/, replacement: path.resolve(__dirname, 'src/core/config/index') },
    { find: /^@\/config\/(.*)/, replacement: path.resolve(__dirname, 'src/core/config/$1') },
    { find: /^@\/theme\/(.*)/, replacement: path.resolve(__dirname, 'src/core/theme/$1') },
    { find: /^@\/types$/, replacement: path.resolve(__dirname, 'src/core/types_app/index') },
    { find: /^@\/types\/(.*)/, replacement: path.resolve(__dirname, 'src/core/types_app/$1') },
    { find: /^@\/(.*)/, replacement: path.resolve(__dirname, 'src/$1') },
    { find: /^@core\/(.*)/, replacement: path.resolve(__dirname, 'src/core/$1') },
    { find: /^@user\/(.*)/, replacement: path.resolve(__dirname, 'src/user/$1') },
    { find: '@config', replacement: path.resolve(__dirname, 'devholm.config') },
  ],
},
```

### 6. Create the user layer

```bash
mkdir -p src/user/content
mkdir -p src/user/extensions/admin
mkdir -p src/user/extensions/db/migrations
mkdir -p src/user/views
```

Create `src/user/views/README.md`:

```md
# User Views

Place ejected view overrides here.
Run `pnpm devholm eject <viewName>` to copy a core view into this directory.
```

### 7. Create `devholm.config.ts`

Copy the template from `docs/configuration.md` and fill in your site details. At minimum:

```ts
import type { DevHolmConfig } from '@core/types';

const config: DevHolmConfig = {
  site: {
    name: 'Your Site Name',
    url: 'https://yourdomain.com',
    description: 'Your description',
    author: { name: 'Your Name', email: 'you@example.com' },
  },
  nav: {
    main: [
      { label: 'Blog', href: '/blog' },
      { label: 'About', href: '/about' },
    ],
    social: [],
  },
  theme: { defaultMode: 'dark' },
  features: {
    blog: true,
    resume: false,
    rss: true,
    search: true,
    analytics: false,
  },
  extensions: {
    admin: [],
  },
};

export default config;
```

### 8. Migrate page content to the user layer

Move hardcoded content out of your page components into typed modules:

- `src/user/content/home.ts` — hero text, tagline
- `src/user/content/about.ts` — bio, skills, timeline
- `src/user/content/now.ts` — "what I'm doing now" entries

See `docs/configuration.md` for the expected shapes.

### 9. Migrate admin extensions

If you had custom items in `AdminLayoutClient.tsx`, move them to:

**`src/user/extensions/admin/index.tsx`**:

```tsx
import type { AdminExtension } from '@core/types/extensions';
import MyIcon from '@mui/icons-material/MyIcon';
import MyPage from './my-page/MyPage';

export const adminExtensions: AdminExtension[] = [
  {
    id: 'my-extension',
    label: 'My Extension',
    href: '/admin/my-extension',
    icon: <MyIcon fontSize="small" />,
    position: 'after:analytics',
    component: MyPage,
  },
];
```

Then reference `adminExtensions` in `devholm.config.ts`:

```ts
import { adminExtensions } from './src/user/extensions/admin';

// in config:
extensions: { admin: adminExtensions }
```

### 10. Update `knexfile.js` for dual migrations

```js
migrations: {
  directory: ['./src/core/db/migrations', './src/user/extensions/db/migrations'],
  extension: 'ts',
}
```

### 11. Verify the migration

```bash
pnpm type-check   # must pass with 0 errors
pnpm test         # must pass all tests
pnpm build        # must produce a successful build
```

---

## Path Alias Quick Reference

| Old import | New import (unchanged) | Resolves to |
|------------|------------------------|-------------|
| `@/components/X` | `@/components/X` | `src/core/components/X` |
| `@/lib/X` | `@/lib/X` | `src/core/lib/X` |
| `@/hooks/X` | `@/hooks/X` | `src/core/hooks/X` |
| `@/db/X` | `@/db/X` | `src/core/db/X` |
| `@/config` | `@/config` | `src/core/config/index` |
| `@/theme/X` | `@/theme/X` | `src/core/theme/X` |
| `@/types` | `@/types` | `src/core/types_app/index` |
| _(new)_ | `@core/X` | `src/core/X` |
| _(new)_ | `@user/X` | `src/user/X` |
| _(new)_ | `@config` | `devholm.config` |

> **Note:** All existing `@/` imports continue to work unchanged via tsconfig alias overrides. You only need to rewrite them if you want to explicitly reference the new locations.

---

## New Files Added in v2.0.0

```
devholm.config.ts               ← configuration contract
scripts/devholm-cli.ts          ← CLI tool
src/core/lib/resolveView.ts     ← view resolution helper
src/core/types/                 ← framework types (DevHolmConfig, extensions, views)
src/user/content/               ← typed user content modules
src/user/extensions/admin/      ← admin extension registration
src/user/extensions/db/         ← user DB migrations
src/user/views/                 ← ejected view overrides (empty by default)
docs/                           ← framework documentation
CHANGELOG.md                    ← version history
commitlint.config.js            ← conventional commit rules
.release-it.json                ← release automation config
.npmrc                          ← save-exact=true
```

## Files Deleted in v2.0.0

All `*PageClient.tsx` files were deleted. Their logic now lives in the corresponding view component under `src/core/views/`.

---

## Semantic Versioning Going Forward

From v2.0.0 onward this project uses [Conventional Commits](https://www.conventionalcommits.org/):

| Commit prefix | Version bump |
|---------------|-------------|
| `fix: …` | Patch (2.0.0 → 2.0.1) |
| `feat: …` | Minor (2.0.0 → 2.1.0) |
| `feat!: …` or `BREAKING CHANGE:` in body | Major (2.0.0 → 3.0.0) |
| `docs:`, `chore:`, `refactor:`, `test:` | No bump |

**Release workflow:**

```bash
pnpm release:dry   # preview what would happen
pnpm release       # bump version, update CHANGELOG, create git tag
git push --follow-tags
```
