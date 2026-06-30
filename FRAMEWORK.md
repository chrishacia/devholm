# DevHolm Framework — Ownership Guide

This document defines which directories belong to the **framework engine** and which
belong to **your application layer**. Understanding this boundary is the key to getting
clean `git merge upstream/main` updates with zero conflicts.

---

## The Four Zones

```
┌─────────────────────────────────────────────────────────────────┐
│  ZONE 1 — CORE ENGINE (src/core/)                               │
│  The framework's brain. Never modify these files.               │
│  Pull upstream updates freely.                                  │
├─────────────────────────────────────────────────────────────────┤
│  ZONE 2 — USER APPLICATION LAYER (src/user/)                    │
│  Your site's content, theme, view overrides, extensions.        │
│  The framework never modifies these. Build freely.              │
├─────────────────────────────────────────────────────────────────┤
│  ZONE 3 — ROUTING WIRING (src/app/)                             │
│  Next.js App Router. Mostly framework-managed thin files.       │
│  Only add files here for extension page routes.                 │
├─────────────────────────────────────────────────────────────────┤
│  ZONE 4 — CONFIGURATION CONTRACT (devholm.config.ts)            │
│  The single file that connects zones 1 and 2.                   │
│  You edit this to wire your content, theme, and extensions.     │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Ownership Quick Reference

| Path                   | Owner         | Rule                                             |
| ---------------------- | ------------- | ------------------------------------------------ |
| `src/core/`            | **Framework** | Never modify                                     |
| `src/user/`            | **You**       | Full ownership                                   |
| `src/user/content/`    | **You**       | Edit freely — your page content                  |
| `src/user/theme/`      | **You**       | Edit freely — your MUI theme                     |
| `src/user/views/`      | **You**       | Edit after `pnpm devholm eject <view>`           |
| `src/user/extensions/` | **You**       | Edit freely — your custom features               |
| `src/app/`             | **Framework** | Only add wrapper files for your extension routes |
| `devholm.config.ts`    | **You**       | Edit to configure the framework                  |
| `middleware.ts`        | **Framework** | Never modify (Next.js requires root location)    |
| `src/auth.ts`          | **Framework** | Never modify (NextAuth requires this path)       |
| `knexfile.js`          | **Framework** | Never modify (scans both core + user migrations) |
| `.env`                 | **You**       | Your secrets, never committed                    |
| `.github/`             | **You**       | Your CI/CD config                                |
| `nginx/`               | **You**       | Your server config                               |
| `Dockerfile`           | **You**       | Your deployment setup                            |

---

## Customization Paths

### Change your theme

Edit `src/user/theme/theme.ts`. Register in `devholm.config.ts`.

### Change page content (About, Now, Home sidebar)

Edit the files in `src/user/content/`. The framework reads them at render time.

### Add a component to a page (without ejecting)

Register a component in `devholm.config.ts → slots`. See `SlotName` type for all injection points.

### Take full control of a page layout

```bash
pnpm devholm eject about   # copies core view to src/user/views/about/
```

Then register in `devholm.config.ts → views`.

### Add a custom admin page

1. Create your page in `src/user/extensions/admin/<feature>/`
2. Add a thin re-export in `src/app/admin/<feature>/page.tsx`
3. Register the nav item in `src/user/extensions/admin/index.ts`
4. Wire to `devholm.config.ts → extensions.admin`

### Add a custom database table

Create a migration in `src/user/extensions/db/migrations/`
Name it: `u_YYYYMMDD_NNN_description.ts` (the `u_` prefix is convention for user migrations)

---

## Upgrading DevHolm

```bash
# One-time setup
git remote add upstream https://github.com/devholm/devholm.com

# Upgrade
git fetch upstream
git merge upstream/main

# Apply any new DB schema
pnpm db:migrate
```

**Why zero conflicts:** Everything you customize lives in `src/user/`, `devholm.config.ts`,
`.env`, and your deployment files. DevHolm upstream never touches any of those paths.

---

## What Happens When You Eject a View

```bash
pnpm devholm eject blog
# → copies src/core/views/blog/ to src/user/views/blog/
```

After ejecting, that view is **fully yours** — it no longer auto-updates from upstream.
This is a trade-off: full control in exchange for manual updates to that view.

Use `pnpm devholm status` to see which views you've ejected.
