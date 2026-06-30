# Downstream Boundary Policy

This policy defines which paths a downstream site should edit directly, and which paths should stay framework-owned.

## Goal

Keep downstream upgrades from DevHolm low-conflict and predictable.

## Downstream-safe paths

These are safe for site-specific customization:

- `src/user/**`
- `.github/**`
- `nginx/**`
- `devholm.config.ts`
- `Dockerfile`
- `docker-compose.yml`
- `docker-entrypoint.sh`
- `README.md`
- `DEPLOYMENT.md`
- `GITHUB_SECRETS.md`

## High-risk paths

These should be treated as framework-owned:

- `src/core/**`
- `src/app/**` (except framework-provided dynamic extension entrypoints)
- framework CLI internals unless contributing upstream

## Rules

1. Site-specific business logic belongs in `src/user/**`.
2. Use extension registries before touching framework routing.
3. Add DB customizations in `src/user/extensions/db/**`.
4. If a site feature requires changing `src/core/**`, open a DevHolm seam proposal first.

## Required checks before syncing

Run a baseline-aware boundary check:

```bash
pnpm devholm sync:check --against template/main
```

If your repository uses an upstream remote:

```bash
pnpm devholm sync:check --against upstream/main
```

## CI enforcement example

In downstream repositories, add a CI step that fetches the template baseline and runs:

```bash
git remote add template https://github.com/devholm/devholm.com.git || true
git fetch template main --depth=1
pnpm devholm sync:check --against template/main
```

Non-zero exit code means boundary violations were found and should be reviewed before merging.

## Intentional drift allowlist

If a downstream site must keep specific files outside the default safe boundary, declare them in:

`/.devholm/sync-allowlist.txt`

Supported patterns:

- Exact file path: `scripts/seed-resume.js`
- Prefix wildcard: `scripts/seed-*`
- Directory wildcard: `docs/**`

Use allowlist entries sparingly and keep comments explaining why each entry is needed.
