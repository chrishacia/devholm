# Getting Started with DevHolm

DevHolm is a personal website framework built on Next.js 15. It provides a layered architecture that separates framework code from your personalizations, making it easy to update the framework without losing your customizations.

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 14+

## Setup

### 1. Clone and install

```bash
git clone https://github.com/yourusername/devholm-site.git my-site
cd my-site
pnpm install
```

### 2. Configure environment

Copy the example env file:

```bash
cp .env.example .env
```

Set the required variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/mysite
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AUTHOR_NAME=Your Name
NEXT_PUBLIC_AUTHOR_EMAIL=you@example.com
```

### 3. Configure your site

Edit `devholm.config.ts`:

```typescript
import { aboutContent } from './src/user/content/about';
import { homeContent } from './src/user/content/home';
import { nowContent } from './src/user/content/now';

const config: DevHolmConfig = {
  content: { about: aboutContent, home: homeContent, now: nowContent },
  slots: {},
  views: {},
  extensions: { admin: [] },
};

export default config;
```

### 4. Edit your content

Update the files in `src/user/content/`:

- `about.ts` — Bio, skills, interests
- `home.ts` — Hero text, sidebar text
- `now.ts` — Current project, location, focus areas

### 5. Run migrations

```bash
pnpm db:migrate
```

### 6. Create admin user

```bash
pnpm seed:admin
```

### 7. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Next steps

- [Configuration reference](./configuration.md)
- [Extension system](./extensions.md)
- [CLI reference](./cli.md)
- [Customizing views](./extensions.md#3-view-overrides-eject)
- [Architecture overview](./architecture.md)
