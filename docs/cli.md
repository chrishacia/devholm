# CLI Reference

DevHolm ships with a CLI for common framework tasks.

## Usage

```bash
pnpm devholm <command> [options]
```

---

## Commands

### `eject <view>`

Copy a core view into `src/user/views/` so you can fully customize it.

```bash
pnpm devholm eject about
pnpm devholm eject blog
pnpm devholm eject resume
```

After ejecting, the CLI prints the `devholm.config.ts` snippet to register your override.

**Note:** Ejected views are no longer updated by framework upgrades. You own them.

---

### `new:extension <name>`

Scaffold a new admin extension component in `src/user/extensions/admin/<name>/`.

```bash
pnpm devholm new:extension analytics-pro
```

Creates:

- `src/user/extensions/admin/analytics-pro/AnalyticsProDashboard.tsx`

Prints instructions for creating the route and registering in `devholm.config.ts`.

---

### `new:migration <name>`

Create a timestamped migration file in `src/user/extensions/db/migrations/`.

```bash
pnpm devholm new:migration add_subscribers_table
```

Creates:

- `src/user/extensions/db/migrations/u_<timestamp>_add_subscribers_table.ts`

---

### `list:slots`

Print all named extension slot positions available in core views.

```bash
pnpm devholm list:slots
```

---

### `status`

Print a summary of the current framework state: core views, ejected views, and registered extensions.

```bash
pnpm devholm status
```

Example output:

```
DevHolm Framework Status
========================

Core views (src/core/views/):
  ✓ about
  ✓ blog
  ...

User view overrides (src/user/views/):
  • about  [ejected]

User extensions (src/user/extensions/):
  • admin/telemetry
  • db/migrations  (2 migrations)
```
