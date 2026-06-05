# Upgrading DevHolm

DevHolm is designed to be upgraded without losing your customizations. All your personal code lives in:

- `devholm.config.ts`
- `src/user/` (content, extensions, views)

The framework code lives in `src/core/` and `src/app/`, which is updated by DevHolm releases.

## Upgrade steps

### 0. Check downstream sync readiness

Before merging upstream changes, run:

```bash
pnpm devholm sync:check
```

This command verifies your local edits stay inside downstream-safe boundaries (`src/user/**`, `devholm.config.ts`, and deploy/config files). If it reports edits in `src/core/**` or framework routing files, expect higher merge risk and move those customizations into `src/user/**` when possible.

### 1. Fetch the latest framework changes

```bash
git remote add upstream https://github.com/devholm/devholm.com.git
git fetch upstream
git merge upstream/main --no-commit
```

### 2. Review conflicts

The only files that should conflict are:

- `src/core/**` — accept upstream changes (theirs)
- `src/app/**` — accept upstream changes for routing pages, review admin pages
- `devholm.config.ts` — keep yours
- `src/user/**` — keep yours

### 3. Check your ejected views

If you have ejected views (visible in `pnpm devholm status`), compare them with the updated core views to see if you want to incorporate changes:

```bash
diff src/user/views/about/AboutView.tsx src/core/views/about/AboutView.tsx
```

### 4. Run migrations

```bash
pnpm db:migrate
```

### 5. Validate

```bash
pnpm typecheck && pnpm test && pnpm build
```

## What's safe to customize

| Location                 | Safe to edit?                            |
| ------------------------ | ---------------------------------------- |
| `devholm.config.ts`      | ✓ Yes — your configuration contract      |
| `src/user/content/*.ts`  | ✓ Yes — your narrative content           |
| `src/user/extensions/**` | ✓ Yes — your extensions                  |
| `src/user/views/**`      | ✓ Yes — ejected view overrides           |
| `src/core/**`            | ✗ No — overwritten by updates            |
| `src/app/**/page.tsx`    | ⚠ Thin wrappers only — minimize changes |

## What breaks upgrades

- Editing files in `src/core/` directly
- Adding business logic to `src/app/**/page.tsx` routing files instead of view components
- Hardcoding values that should come from `devholm.config.ts` or `siteConfig`
