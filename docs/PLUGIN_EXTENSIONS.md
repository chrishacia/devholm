# Plugin Extensions Framework

This document describes the Phase 1 plugin extension framework for DevHolm. This framework provides generic seams for plugins to extend the core application without hardcoding plugin-specific logic into the main codebase.

## Architecture

The plugin extension system is built on three core pillars:

1. **Extension Types** - Contracts defined in `src/core/types/extensions.server.ts`
2. **Extension Dispatchers** - Runtime resolution functions in `src/core/lib/extensions.server.ts`
3. **Extension Registries** - Plugin definitions in `src/user/extensions/*/index.ts`

### Design Principle: Complete Isolation

The core principle is **strict isolation**: DevHolm core must never depend on plugin-specific code, database records, services, types, or UI components. Plugins register themselves with the framework; the framework does not know about plugins at compile time.

## Extension Types

### PublicRouteExtension

Allows plugins to claim and handle specific URL paths (e.g., redirects, dynamic pages).

**Contract:**

```typescript
interface PublicRouteExtension {
  pluginId?: string;
  id: string;
  claimPath: (
    pathname: string,
    request: NextRequest,
    helpers: ExtensionHelpers
  ) => Promise<Response | null> | Response | null;
}
```

**Key Features:**

- Async path matching supports runtime settings checks
- Returns `Response` to claim the path, or `null` to decline
- Errors are caught and logged; extension continues if it throws
- Conflicts (multiple matches for same path) are detected and fail the route

**Route Precedence** (in order):

1. Next.js specific routes (`/api`, `/admin`, `/static`, etc.)
2. DevHolm dev pages (from `devPageDefinitions`)
3. **Plugin public routes** ← This extension type
4. CMS pages (single-segment slugs only)
5. 404 Not Found

### EmbedExtensionConfig

Allows plugins to define custom shortcodes for markdown content (e.g., `[shortcode:arg]`).

**Contract:**

```typescript
interface EmbedExtensionConfig {
  pluginId?: string;
  id: string;
  pattern: RegExp;
  render: (
    match: RegExpExecArray,
    content: string,
    helpers: ExtensionHelpers
  ) => Promise<string | null> | string | null;
}
```

**Key Features:**

- Regex pattern matching for shortcode detection
- `render` returns HTML string or `null` (leaves shortcode as-is on error)
- Errors are caught and logged; shortcode preserved if extension throws
- Extensions processed in registry order; first match wins (no conflicts)

**Built-in Embeds:**

- `[calendar slug="slug-name"]` - Calendar collection with upcoming events or booking types
- `[gallery slug="slug-name"]` - Gallery collection with images, videos, and external media

## Extension Helpers

All extensions receive `ExtensionHelpers` for accessing core services:

```typescript
interface ExtensionHelpers {
  auth: typeof import('@/auth').auth;
  getDb: typeof import('@/db').getDb;
  verifyAdmin: typeof import('@/lib/auth-helpers').verifyAdmin;
}
```

This provides:

- Database access via Kyselely
- NextAuth session/token management
- Admin verification utilities

## Runtime Settings & Plugin Enablement

Plugins are enabled/disabled via `site_settings` with key pattern:

```
plugin:<plugin-id>:enabled
```

Extensions check enablement using:

```typescript
const enabled = await isPluginEnabled('plugin-id');
if (!enabled) {
  return null; // Decline to handle
}
```

**Important**: Check enablement at entry points:

- Public route dispatcher checks before invoking `claimPath()`
- Embed registry filters disabled plugins before rendering
- Admin pages check enablement before loading component

## Implementation Pattern

### Creating a Public Route Extension

1. **Define the extension:**

```typescript
import type { PublicRouteExtension } from '@core/types/extensions.server';

export const myRouteExtensions: PublicRouteExtension[] = [
  {
    pluginId: 'my-plugin',
    id: 'my-route-handler',
    claimPath: async (pathname, request, helpers) => {
      // Check if path matches your pattern
      if (!pathname.startsWith('/my-pattern')) {
        return null;
      }

      // Do work...
      return new Response('content');
    },
  },
];
```

2. **Register in the public-routes registry:**

```typescript
// src/user/extensions/public-routes/index.ts
import { myRouteExtensions } from '@/plugins/my-plugin/extensions';

export const publicRouteExtensions: PublicRouteExtension[] = [...myRouteExtensions];
```

3. **Access via dispatcher:**

```typescript
// In middleware, catch-all routes, etc.
const response = await resolvePublicRouteExtension(pathname, request);
if (response) {
  return response;
}
```

### Creating an Embed Extension

1. **Define the embed:**

```typescript
import type { EmbedExtensionConfig } from '@core/types/extensions.server';

export const myEmbeds: EmbedExtensionConfig[] = [
  {
    pluginId: 'my-plugin',
    id: 'my-embed-type',
    pattern: /^\[mytype\s+([^\]]+)\]$/,
    render: async (match, content, helpers) => {
      const arg = match[1];
      const html = `<div>${arg}</div>`;
      return html;
    },
  },
];
```

2. **Register in the embeds registry:**

```typescript
// src/user/extensions/embeds/index.ts
import { myEmbeds } from '@/plugins/my-plugin/extensions';

export const embedExtensions: EmbedExtensionConfig[] = [
  ...calendarEmbeds,
  ...galleryEmbeds,
  ...myEmbeds,
];
```

3. **Automatically used in content:**

```typescript
// parseMarkdownWithEmbeds() loops through embedExtensions
const html = await parseMarkdownWithEmbeds(markdownContent);
```

## Admin Page Extensions

Admin pages can be registered with plugin IDs. The dispatcher now enforces enablement checks:

```typescript
// In AdminPageExtension
{
  pluginId: 'my-plugin',
  href: '/admin/my-plugin',
  loadPage: () => import('./MyAdminPage'),
}
```

The dispatcher (`getAdminPageComponent`, `getAdminPageMetadata`) will:

1. Find the extension by path
2. Check if the plugin is enabled
3. Return `null` if disabled (shows 404 to user)

## Middleware Integration

The public route resolver is integrated into middleware with this flow:

1. Check public route extensions for the pathname
2. If matched, return the response (redirect, etc.)
3. Otherwise continue to admin checks, dev pages, CMS pages, 404

**Path patterns to exclude from public route checking:**

- `/admin/*` - Admin pages (handled by auth middleware)
- `/api/*` - API routes (handled by separate dispatcher)
- `/static/*` - Static assets

## Conflict Detection

### Public Routes

If multiple extensions claim the same path, route resolution throws:

```
Error: Route conflict at /path: extension1 (plugin-a), extension2 (plugin-b)
```

This prevents ambiguous routing. Extensions must be mutually exclusive.

### Embeds

Since embeds use regex patterns and first-match-wins, conflicts are prevented by careful pattern design. Two embeds can match the same shortcode format, but only the first in registry order is used.

## Error Handling

### Public Routes

Extension errors are caught and logged; the next extension is tried:

```
Extension my-route (plugin my-plugin) failed to claim path /test: <error details>
```

### Embeds

Extension errors leave the shortcode as-is in the rendered output:

```
Embed extension my-embed (plugin my-plugin) failed: <error details>
[mytype arg] ← Original shortcode appears in output
```

This ensures graceful degradation if an extension fails.

## Backward Compatibility

### Calendar & Gallery Embeds

Calendar and gallery embeds are extracted to the registry as `EmbedExtensionConfig[]`:

- `calendarEmbeds` in `src/core/lib/embeds/calendar.ts`
- `galleryEmbeds` in `src/core/lib/embeds/gallery.ts`

Shortcode syntax remains unchanged:

- `[calendar slug="slug"]`
- `[gallery slug="slug"]`

The `parseMarkdownWithEmbeds()` function uses the registry instead of hardcoded logic, but behavior is identical.

## Examples

### URL Shortener Plugin (Phase 2)

```typescript
// Plugin defines public route for /abc123 → redirect
const publicRouteExtensions: PublicRouteExtension[] = [
  {
    pluginId: 'url-shortener',
    id: 'shortcode-redirect',
    claimPath: async (pathname, request, helpers) => {
      const code = pathname.slice(1); // /abc123 → abc123
      const db = helpers.getDb();
      const shortUrl = await db
        .selectFrom('shortUrls')
        .select('targetUrl')
        .where('code', '=', code)
        .executeTakeFirst();

      if (!shortUrl) {
        return null; // Not a shortcode
      }

      // Record analytics, then redirect
      await recordClick(code);
      return Response.redirect(shortUrl.targetUrl, 302);
    },
  },
];

// Plugin can also define embeds for stats
const embedExtensions: EmbedExtensionConfig[] = [
  {
    pluginId: 'url-shortener',
    id: 'shortcode-stats',
    pattern: /^\[shortcode-stats\s+([^\]]+)\]$/,
    render: async (match, content, helpers) => {
      const code = match[1];
      const db = helpers.getDb();
      const stats = await db
        .selectFrom('shortUrls')
        .select(['code', 'clicks'])
        .where('code', '=', code)
        .executeTakeFirst();

      if (!stats) {
        return null; // Leave as-is
      }

      return `<div>${stats.code}: ${stats.clicks} clicks</div>`;
    },
  },
];
```

## Testing

### Unit Tests

Extensions should be tested in isolation:

```typescript
describe('PublicRouteExtension', () => {
  it('claims matching paths', async () => {
    const helpers = mockExtensionHelpers();
    const result = await extension.claimPath('/test', mockRequest, helpers);
    expect(result).toBeInstanceOf(Response);
  });

  it('declines non-matching paths', async () => {
    const result = await extension.claimPath('/other', mockRequest, helpers);
    expect(result).toBeNull();
  });
});
```

### Integration Tests

Test the dispatcher with multiple extensions:

```typescript
describe('resolvePublicRouteExtension', () => {
  it('returns first matching extension', async () => {
    const response = await resolvePublicRouteExtension('/test', mockRequest);
    expect(response).toBeInstanceOf(Response);
  });

  it('throws on conflict', async () => {
    await expect(resolvePublicRouteExtension('/conflict', mockRequest)).rejects.toThrow(
      'Route conflict'
    );
  });
});
```

## Versioning & Stability

The extension contracts in `src/core/types/extensions.server.ts` define the plugin API. Changes to these contracts must be carefully considered:

- **Major Version**: Breaking changes to contract structure
- **Minor Version**: New optional fields in contracts
- **Patch Version**: Bug fixes, implementation changes

Plugin authors depend on these contracts; incompatible changes require migration guides.

## FAQ

**Q: How do I know if a plugin is enabled?**
A: Call `await isPluginEnabled('plugin-id')` inside your extension. The dispatcher also checks before invoking your extension.

**Q: Can I have two plugins claim the same route?**
A: No. The dispatcher detects conflicts and throws an error. Routes must be mutually exclusive.

**Q: What if my extension throws an error?**
A: The error is logged, and for public routes, the next extension is tried. For embeds, the shortcode is left as-is.

**Q: Can I modify other plugin data?**
A: No. Extensions should only access their own plugin's data. The database and auth helpers are generic; use plugin-specific tables and settings.

**Q: How do I test my extension in development?**
A: Use `site_settings` to enable/disable your plugin, then test the routes/embeds in a browser or test suite.
