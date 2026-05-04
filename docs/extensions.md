# Extension System

DevHolm has three extension points that let you customize behavior without modifying core files.

---

## 1. Extension Slots

Slots are named injection points inside core page views. Register a React component to render at that position.

### Available slots

Run `pnpm devholm list:slots` to see all available slot names. Key examples:

| Slot | Location |
|---|---|
| `home.hero.below` | Below the hero section on the homepage |
| `home.sidebar.top` | Top of the right sidebar |
| `home.sidebar.bottom` | Bottom of the right sidebar |
| `blog.sidebar.top` | Top of blog sidebar |
| `blog.post.belowContent` | Below a blog post |
| `admin.dashboard.top` | Top of admin dashboard |

### Registering a slot

1. Create your component in `src/user/slots/`:

```tsx
// src/user/slots/HomeBanner.tsx
export default function HomeBanner() {
  return <div>My custom banner</div>;
}
```

2. Register in `devholm.config.ts`:

```typescript
slots: {
  'home.hero.below': HomeBanner,
},
```

---

## 2. Admin Extensions

Add custom pages to the admin sidebar without editing `AdminLayoutClient.tsx`.

### Registering an extension

1. Scaffold with the CLI: `pnpm devholm new:extension my-feature`

2. Add a route at `src/app/admin/my-feature/page.tsx`

3. Register in `src/user/extensions/admin/index.tsx`:

```tsx
import { MyIcon } from '@mui/icons-material';
import type { AdminExtension } from '@core/types/extensions';

export const adminExtensions: AdminExtension[] = [
  {
    navItem: {
      label: 'My Feature',
      href: '/admin/my-feature',
      icon: <MyIcon />,
      position: 'after:analytics',  // See AdminNavPosition
    },
  },
];
```

4. Wire in `devholm.config.ts`:

```typescript
import { adminExtensions } from './src/user/extensions/admin/index';

extensions: { admin: adminExtensions },
```

### `position` values

| Value | Behavior |
|---|---|
| `'before:dashboard'` | Insert before Dashboard |
| `'after:<segment>'` | Insert after the item whose href ends with `/<segment>` |
| _(omitted)_ | Insert before Settings |

---

## 3. View Overrides (Eject)

Take full control of a core view by ejecting it into `src/user/views/`.

```bash
pnpm devholm eject about
```

This copies `src/core/views/about/AboutView.tsx` → `src/user/views/about/AboutView.tsx`.

Then register in `devholm.config.ts`:

```typescript
views: {
  'about': () => import('./src/user/views/about/AboutView').then(m => m.default),
},
```

Future framework updates will no longer affect your ejected view — it's yours entirely.

### Available views to eject

`about`, `blog`, `blog-post`, `contact`, `home`, `now`, `projects`, `resume`, `search`, `uses`

---

## 4. User DB Migrations

Place custom database migrations in `src/user/extensions/db/migrations/`. Knex picks them up automatically alongside core migrations.

```bash
pnpm devholm new:migration add_my_table
```

This creates `src/user/extensions/db/migrations/u_<timestamp>_add_my_table.ts`.
