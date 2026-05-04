# DevHolm Architecture

DevHolm follows a **layered framework model** similar to Laravel/CodeIgniter. The codebase is split into three layers:

```
src/
├── core/          ← Framework engine — updated by DevHolm, never touched by users
│   ├── components/   UI building blocks
│   ├── config/       Site configuration utilities
│   ├── db/           Database layer (Knex + PostgreSQL)
│   ├── hooks/        Shared React hooks
│   ├── lib/          Utilities, auth helpers, markdown, etc.
│   ├── theme/        Material UI theme + ThemeProvider
│   ├── types/        Framework type contracts (DevHolmConfig, etc.)
│   ├── types_app/    Application types (DB models, API shapes)
│   └── views/        Full-page view components
│
├── user/          ← Your customization layer — never overwritten by updates
│   ├── content/      Typed narrative content (about.ts, home.ts, now.ts)
│   ├── extensions/
│   │   ├── admin/    Admin sidebar extensions (index.tsx)
│   │   └── db/
│   │       └── migrations/   User DB migrations
│   ├── slots/        Optional slot components (injected into core views)
│   └── views/        Ejected view overrides (after: pnpm devholm eject <view>)
│
└── app/           ← Next.js App Router wiring — thin, mostly generated
    ├── (feature pages that import from @core/views/)
    └── api/

devholm.config.ts  ← Single configuration contract
```

## Core vs User boundary

| Aspect | Core (`src/core/`) | User (`src/user/`, `devholm.config.ts`) |
|---|---|---|
| Updated by framework? | ✓ Yes | ✗ Never |
| Contains | Reusable views, hooks, DB, theme | Content, extensions, overrides |
| Import alias | `@core/*` | `@user/*` |

## Data flow

```
devholm.config.ts
       │
       ├── content.about  ──→  AboutView (props)
       ├── content.home   ──→  HomeView (props)
       ├── content.now    ──→  NowView (props)
       ├── slots          ──→  ExtensionSlot (renders or no-ops)
       ├── views          ──→  resolveView() (user override or core)
       └── extensions.admin ─→ AdminLayoutClient (merged nav items)
```

## Path aliases

| Alias | Resolves to |
|---|---|
| `@/*` | `src/*` (app router pages, auth, etc.) |
| `@core/*` | `src/core/*` |
| `@user/*` | `src/user/*` |
| `@config` | `devholm.config.ts` |
| `@/components/*` | `src/core/components/*` |
| `@/lib/*` | `src/core/lib/*` |
| `@/hooks/*` | `src/core/hooks/*` |
| `@/db/*` | `src/core/db/*` |
| `@/config/*` | `src/core/config/*` |
| `@/theme/*` | `src/core/theme/*` |
| `@/types/*` | `src/core/types_app/*` |
