# Plugin Extensions Framework - Phase 1

This document describes the Phase 1 plugin extension framework for DevHolm. This framework provides generic seams for plugins to extend the core application without hardcoding plugin-specific logic into the main codebase.

## Architecture

The plugin extension system is built on three core pillars:

1. **Extension Types** - Contracts defined in `src/core/types/extensions.server.ts`
2. **Dispatchers** - Two-phase resolution in `src/core/lib/public-route-dispatcher*.server.ts` and `src/core/lib/embed-processor*.server.ts`
3. **Registries** - Plugin definitions in `src/user/extensions/*/index.ts`

### Design Principle: Complete Isolation

The core principle is **strict isolation**: DevHolm core must never depend on plugin-specific code, database records, services, types, or UI components. Plugins register themselves with the framework; the framework does not know about plugins at compile time.

## Two-Phase Dispatch Architecture

All extension dispatchers follow a strict two-phase model:

### Phase 1: Collection (Read-Only)

- All matchers run in a **side-effect-free, read-only context**
- Database queries are read-only
- Settings are read-only
- All potential matches collected
- No handler executes
- Exceptions are caught and logged

### Phase 2: Conflict Detection

- If exactly 1 match: proceed to handler
- If 0 matches: return no-match type
- If >1 matches: return conflict error immediately (before any handler executes)
- If exception during Phase 1: return error type immediately

### Phase 3: Handling (If Safe)

- Handler executes ONLY if exactly 1 match confirmed
- Database writes are allowed
- Side effects allowed
- Handler exceptions logged and return error type

**Critical Invariant:** A handler may NEVER execute if there's ambiguity about which extension should claim the request.

## Public Route Extensions

Allows plugins to claim and handle specific URL paths (e.g., dynamic pages, redirects).

**Contract:**

```typescript
interface PublicRouteExtension {
  pluginId?: string;
  id: string;
  // Phase 1: Side-effect-free matching
  match: (
    pathname: string,
    request: NextRequest,
    context: PublicRouteMatchContext
  ) => Promise<TMatch | null> | TMatch | null;
  // Phase 3: Handling (after conflict detection passes)
  handle: (
    match: TMatch,
    request: NextRequest,
    helpers: ExtensionHelpers
  ) => Promise<Response> | Response;
}

type PublicRouteResolution =
  | { type: 'no-match' }
  | { type: 'match'; response: Response }
  | { type: 'conflict'; conflictingExtensions: string[]; error: Error }
  | { type: 'error'; error: Error };
```

**Key Features:**

- **Phase 1 matching** - Async path matching with read-only database access
- **Returns opaque match** - `TMatch` is extension-specific state; core doesn't inspect
- **Conflict detection** - Before any handler executes, all matches are checked
- **Two-result model** - Match returns result state (opaque) or `null`; handle receives result state
- **Error isolation** - Single extension error logged; next extension tried (graceful degradation)
- **Multi-claim conflicts** - Multiple extensions claiming same path returns 409 Conflict (fail closed)
- **Disabled plugins** - Skipped before Phase 1 matching
- **Reserved routes** - Built from filesystem structure + dev pages; plugins cannot claim

**Match Context (Phase 1 Read-Only):**

```typescript
interface PublicRouteMatchContext {
  readonly reservedRoutes: ReadonlySet<string>;
  readonly db: ReadOnlyDatabaseAccessor; // Read-only query subset
  readonly settings: ReadOnlySettingsAccessor;
}
```

The narrower context prevents accidental writes during the read-only phase.

**Reserved Routes** (cannot be claimed by extensions):

Built from:

1. Framework roots: `/admin`, `/api`, `/auth`, `/invite`, `/static`, `/public`, `/uploads`
2. Next.js infrastructure: `/_next`, `/.well-known`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`
3. Filesystem-owned pages: `/about`, `/blog`, `/calendar`, `/contact`, `/gallery`, `/now`, `/projects`, `/resume`, `/search`, `/uses`
4. Developer-defined pages: from `devPageDefinitions`

**Route Precedence & Control Flow**

```
Request arrives
  ↓
1. Middleware runs (via matcher config)
   - Check if path is reserved (excluded)
   - If reserved: skip to App Router
   - If not reserved:
     → Call publicRouteDispatcher (two-phase dispatch)
     → Phase 1: Collect all matches (side-effect-free)
     → Phase 2: Check conflict
       - If conflict (>1 match): return 409 Conflict JSON response
       - If error during match: return 503 Service Unavailable
     → Phase 3: If exactly 1 match, execute handler
       - If handler throws: return 503 Service Unavailable
       - If handler succeeds: return Response immediately
     → If no match: call NextResponse.next() → App Router
   ↓
2. App Router processes request
   - Dev pages: exact routes like /blog, /calendar
   - CMS pages: catch-all [...slug] for single-segment paths
   - API routes: /api/...
   - Admin routes: /admin/...
   - 404 if no match
```

**Middleware Response Types:**

- **200 OK** - Extension handled path successfully (handler returned Response)
- **409 Conflict** - Multiple extensions claimed same path; error logged
- **503 Service Unavailable** - Matcher exception or handler exception; error logged
- **No response** - No extension claimed path; Next.js App Router processes request

**Important Implementation Details:**

- Public routes run at MIDDLEWARE level, NOT in App Router
- Extensions execute BEFORE dev pages and CMS pages
- If no extension claims path, `NextResponse.next()` called, App Router runs normally (no plugin dependency)
- If extension throws during match, next extension tried (graceful error handling)
- If multiple extensions match, NO handler executes and 409 returned (fail closed)
- Dev pages load normally even if plugin data unavailable

## Embed Extensions

Allows plugins to define custom shortcodes for markdown content (e.g., `[calendar:slug]`, `[gallery:id]`).

**Contract:**

```typescript
interface EmbedExtensionConfig {
  pluginId?: string;
  id: string;
  shortcode: string; // Unique identifier for shortcode
  pattern: RegExp; // Global pattern with 'g' flag
  render: (
    match: RegExpExecArray,
    content: string,
    helpers: ExtensionHelpers
  ) => Promise<string | null> | string | null;
}
```

**Key Features:**

- Regex pattern matching for shortcode detection
- `render` returns HTML string or `null` (leaves shortcode as-is if render returns null)
- Errors caught and logged; shortcode preserved if extension throws (graceful degradation)
- Extensions processed in registry order; first matching pattern wins
- **Duplicate embed IDs and shortcodes detected at startup** (fail fast)
- **Duplicate shortcodes throw error** - Two different embeds cannot have same shortcode name

**Pattern Requirements:**

- MUST have global flag: `/pattern/g`
- MUST be inline-matching: `/\\[shortcode.*\\]/g` (not anchored with `^` or `$`)
- Using inline patterns with named captures improves match accuracy

**Built-in Embeds:**

- `[calendar slug="slug-name"]` - Calendar collection with upcoming events
- `[gallery slug="slug-name"]` - Gallery collection with images, videos, and external media

**Validation (Module Initialization):**

Registry validation runs when `src/user/extensions/embeds/index.ts` loads:

1. **Duplicate ID Detection** - Throws error if two embeds have same `id`
2. **Duplicate Shortcode Detection** - Throws error if two embeds have same `shortcode`
3. **Pattern Validation** - Throws error if pattern lacks global `g` flag
4. **Pattern Overlap Warnings** - Warns (doesn't fail) if patterns might overlap

Example error:

```
Embed ID conflict: duplicate ID 'my-embed' registered twice.
First: my-embed (plugin: my-plugin),
Second: my-embed (plugin: other-plugin).
Embed IDs must be unique. Disable one embed or rename it.
```

**Render Error Handling:**

If `render()` throws an error:

- Error is logged with extension ID and plugin name
- Original shortcode is left in the rendered output (graceful degradation)
- Next embed extension continues processing
- Page does not fail

Example logging:

```
Embed extension my-embed (plugin: my-plugin) failed to render shortcode: [error message]
```

## Extension Helpers

All extensions receive `ExtensionHelpers` for accessing core services:

```typescript
interface ExtensionHelpers {
  auth: typeof import('@/auth').auth;
  getDb: typeof import('@/db').getDb;
  verifyAdmin: typeof import('@/lib/auth-helpers').verifyAdmin;
}
```

**Available in:**

- `PublicRouteExtension.handle()` - Full helpers (database writes allowed)
- `PublicRouteExtension.match()` - Same helpers but should only read
- `EmbedExtensionConfig.render()` - Full helpers

## Runtime Settings & Plugin Enablement

Plugins are enabled/disabled via `site_settings` table with key pattern:

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

**Enablement Checks Happen At:**

- Public route dispatcher: before Phase 1 matching
- Embed processor: before processing matches
- Admin pages: before loading component

Disabled extensions are skipped entirely and their handlers never execute.

## Dependency Injection Pattern

For testing purposes, core functions are split:

**Public Routes:**

```typescript
// Core function (testable via dependency injection)
async function dispatchPublicRoute(
  pathname: string,
  request: NextRequest,
  dependencies: PublicRouteDispatcherDependencies
): Promise<PublicRouteResolution>;

// Production wrapper (supplies real dependencies)
export async function resolvePublicRouteExtension(
  pathname: string,
  request: NextRequest
): Promise<PublicRouteResolution>;
```

Tests can inject mock extensions, mock databases, and verify behavior directly.

**Embeds:**

```typescript
// Core function (testable via dependency injection)
async function processEmbeds(
  content: string,
  dependencies: EmbedProcessorDependencies
): Promise<string>;

// Production wrapper (supplies real dependencies)
export async function parseMarkdownWithEmbeds(content: string): Promise<string>;
```

Tests create real embed extensions and verify transformations.

## Implementation Pattern

### Creating a Public Route Extension

1. **Define the extension:**

```typescript
import type { PublicRouteExtension } from '@core/types/extensions.server';
import type { PublicRouteMatchContext } from '@core/lib/public-route-match-context.server';

export const myRouteExtensions: PublicRouteExtension[] = [
  {
    pluginId: 'my-plugin',
    id: 'my-route-handler',
    // Phase 1: Side-effect-free matching
    match: async (pathname, request, context) => {
      // Check if path matches your pattern
      if (!pathname.startsWith('/my-pattern')) {
        return null;
      }

      // Read-only database access is OK
      const db = context.db;
      const exists = await db.query('SELECT COUNT(*) FROM my_table');

      // Return opaque match state that handle() will receive
      return { pathname, timestamp: Date.now() };
    },
    // Phase 3: Handle (only if match returned non-null and no conflicts)
    handle: async (match, request, helpers) => {
      // Database writes are allowed here
      const db = helpers.getDb();
      // ... do work ...
      return new Response('content');
    },
  },
];
```

2. **Register in the public-routes registry:**

```typescript
// src/user/extensions/public-routes/index.ts
import { myRouteExtensions } from '@/plugins/my-plugin/extensions';

export const publicRouteExtensions: PublicRouteExtension[] = [
  ...myRouteExtensions,
  // ... other extensions ...
];
```

3. **Used automatically by middleware:**

The middleware calls `resolvePublicRouteExtension()` automatically.

### Creating an Embed Extension

1. **Define the embed:**

```typescript
import type { EmbedExtensionConfig } from '@core/types/extensions.server';

export const myEmbeds: EmbedExtensionConfig[] = [
  {
    pluginId: 'my-plugin',
    id: 'my-embed-type',
    shortcode: 'mytype', // Unique shortcode name
    pattern: /\[mytype\s+([^\]]+)\]/g, // Global flag required
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

// Validation happens automatically on module load
validateEmbedExtensions(embedExtensions);
```

3. **Automatically used in content:**

```typescript
// parseMarkdownWithEmbeds() loops through embedExtensions
const html = await parseMarkdownWithEmbeds(markdownContent);
```

## Middleware Integration

The public route resolver is integrated into middleware (`middleware.ts`) with these steps:

1. Check if pathname is reserved (cannot be claimed by extensions)
2. Only handle GET and HEAD requests
3. Call `resolvePublicRouteExtension()` for two-phase dispatch
4. Based on `PublicRouteResolution.type`:
   - `'match'`: return the Response immediately
   - `'conflict'`: return 409 Conflict JSON response
   - `'error'`: return 503 Service Unavailable
   - `'no-match'`: call `NextResponse.next()` to continue to App Router
5. Catch-all error handler: return 503 (should never reach here if phases 1-3 handled all cases)

**Middleware Matcher Configuration:**

The matcher (at end of `middleware.ts`) uses explicit path boundaries to avoid false positives:

```typescript
matcher: [
  '/((?!(?:favicon\\.ico|robots\\.txt|sitemap\\.xml|api/|uploads/|\\.well-known/|_next/static|_next/image))[^?]*)',
];
```

This excludes:

- `/api/*` - API routes
- `/uploads/*` - Static uploads
- `/.well-known/*` - Well-known configuration
- `/_next/static/*` and `/_next/image/*` - Next.js internals
- `/favicon.ico`, `/robots.txt`, `/sitemap.xml` - Static metadata

Note: Paths like `/apiary`, `/admin-panel`, `/admin-settings` are NOT excluded because the matcher uses proper path boundaries (e.g., `api/` not `api`).

## Conflict Handling

### Public Routes - Multi-Claim Conflicts

If multiple extensions successfully match the same path in Phase 1, Phase 2 conflict detection catches this:

```json
{
  "type": "conflict",
  "conflictingExtensions": ["extension1 (plugin: plugin-a)", "extension2 (plugin: plugin-b)"],
  "error": "Error: Public route conflict at /path: multiple extensions claim this path: ..."
}
```

**Response to client:** 409 Conflict JSON

**Handling in middleware:**

- Dispatcher detects conflict in Phase 2
- Error logged to console with full details
- `NextResponse.next()` called (NOT returned as error response)
- App Router processes request normally
- Result: typically 404 (App Router has no match either)

**Rationale:** Route conflicts must fail closed. Returning either extension's response would be ambiguous. The conflict is logged but not exposed to client (App Router attempt prevents information leak).

### Embeds - Duplicate Detection

Duplicate embed IDs or shortcodes are detected at module initialization (app startup):

```
Error: Embed ID conflict: duplicate ID 'my-embed' registered twice.
First: my-embed (plugin: plugin-a),
Second: my-embed (plugin: plugin-b).
Embed IDs must be unique. Disable one embed or rename it.
```

```
Error: Embed shortcode conflict: duplicate shortcode 'myshortcode' registered twice.
First: embed1 (plugin: plugin-a),
Second: embed2 (plugin: plugin-b).
Shortcode names must be unique to prevent parsing ambiguity. Rename one shortcode.
```

**Startup behavior:** Startup fails immediately (prevents running with conflicting embeds).

## Testing

### Testing Public Routes

```typescript
import { dispatchPublicRoute } from '@core/lib/public-route-dispatcher-core.server';

test('should match and handle route', async () => {
  const mockExtensions = [
    {
      id: 'test-extension',
      match: async () => ({ some: 'state' }),
      handle: async () => new Response('ok'),
    },
  ];

  const resolution = await dispatchPublicRoute('/test', request, {
    extensions: mockExtensions,
    isPluginEnabled: async () => true,
    getReservedRoutes: () => new Set(['/admin']),
    getHelpers: () => ({
      /* ... */
    }),
  });

  expect(resolution.type).toBe('match');
  expect(resolution.response.status).toBe(200);
});
```

### Testing Embeds

```typescript
import { processEmbeds } from '@core/lib/embed-processor-core.server';
import { validateEmbedExtensions } from '@core/lib/embed-validation.server';

test('should render embeds', async () => {
  const embeds = [
    {
      id: 'test-embed',
      shortcode: 'test',
      pattern: /\[test:([^\]]+)\]/g,
      render: async (match) => `<div>${match[1]}</div>`,
    },
  ];

  validateEmbedExtensions(embeds); // Should not throw

  const result = await processEmbeds('Hello [test:world]', {
    extensions: embeds,
    isPluginEnabled: async () => true,
    getHelpers: () => ({
      /* ... */
    }),
    parseMarkdown: (x) => x,
  });

  expect(result).toContain('<div>world</div>');
});
```

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
- Single extension error is caught and logged; next extension tried (graceful degradation)
- Multiple extensions claiming same path is a conflict; error thrown and logged (fail closed)
- Disabled plugins are skipped before invoking `claimPath()`

**Route Precedence & Control Flow**

The actual control flow is determined by Next.js middleware execution order:

```
Request arrives
  ↓
1. Middleware runs (before App Router)
   - Check if path excluded (/admin, /api, /static)
   - If not excluded:
     → Call resolvePublicRouteExtension()
     → If extension claims path: return Response immediately
     → If extension throws: log, try next extension
     → If multiple claim path: throw conflict error, log, continue
     → If no extension claims: call NextResponse.next()
   ↓
2. App Router processes request (if middleware called NextResponse.next())
   - Next.js handles /api/*, /admin/*, /static/* routes
   - Exact dev pages are evaluated (higher specificity)
   - Catch-all [...]slug] for CMS pages
   - 404 if no match
```

**Effective Route Precedence** (from client perspective):

1. **Public route extensions** (claimed at middleware level)
2. **Next.js specific routes** (/api/_, /admin/_, /static/\*)
3. **DevHolm dev pages** (exact App Router routes like /blog, /calendar, etc.)
4. **CMS pages** (single-segment slugs via catch-all)
5. **404** Not Found

**Important Implementation Details:**

- Public routes run at MIDDLEWARE level, NOT in App Router
- This means extensions execute BEFORE dev pages and CMS pages
- Paths excluded from middleware (`/admin`, `/api`, `/static`) can never be claimed by extensions
- Other paths (like `/blog`, `/calendar`) CAN be claimed by extensions if registered
- If no extension claims a path, App Router runs normally - no dependency on plugin availability
- If extension throws (database down, etc.), next extension is tried - graceful error handling
- If multiple extensions claim same path: error logged, no response returned, App Router proceeds

**Database Availability Impact:**

- If extension calls `helpers.getDb()` and database is down: exception thrown during `claimPath()`
- Exception caught in dispatcher, logged, next extension tried
- If no extension claims path, `NextResponse.next()` called, App Router proceeds
- Dev pages load normally without plugin data (fail safe)
- Core DevHolm is NOT blocked by plugin database unavailability

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
- `render` returns HTML string or `null` (leaves shortcode as-is if render returns null)
- Errors caught and logged; shortcode preserved if extension throws (graceful degradation)
- Extensions processed in registry order; first matching pattern wins
- **Duplicate embed IDs are detected at startup and cause initialization error** (fail fast)

**Built-in Embeds:**

- `[calendar slug="slug-name"]` - Calendar collection with upcoming events or booking types
- `[gallery slug="slug-name"]` - Gallery collection with images, videos, and external media

**Embed Conflict Handling:**

Unlike public routes, embed patterns don't naturally conflict (different patterns). However, duplicate embed IDs (the unique identifier for each embed extension) ARE detected:

- Registry validation runs on module load
- If two embeds have same ID: error logged with both extension names
- Startup fails (prevents silent duplicate registration)
- Both extensions must have unique IDs

Example error:

```
Embed ID conflict: duplicate ID 'my-embed' registered twice.
First: my-embed (plugin: my-plugin),
Second: my-embed (plugin: other-plugin).
Embed IDs must be unique. Disable one embed or rename it.
```

**Render Error Handling:**

If `render()` throws an error:

- Error is logged with extension ID and plugin name
- Original shortcode is left in the rendered output
- Next embed extension continues processing
- Page does not fail; broken embed degrades gracefully

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

### Public Routes - Multi-Claim Conflicts

If multiple extensions successfully claim the same path (all return Response), this is a routing conflict:

```
Error: Public route conflict at /path: multiple extensions claimed this path:
  extension1 (plugin-a), extension2 (plugin-b).
Plugin extensions must be mutually exclusive.
Disable one extension or refactor patterns to avoid overlap.
```

**Conflict handling:**

- Dispatcher collects all extensions that claim the path
- If count > 1: throw error (fail closed)
- Error logged to console
- Middleware catches error, logs it
- Middleware calls `NextResponse.next()` (continues to App Router)
- Result: page 404 (App Router also finds no match)

**This is intentional:** Route conflicts must fail closed. Returning either response would be ambiguous. The strict failure ensures conflicts are caught during development.

### Embeds - Duplicate ID Detection

Duplicate embed IDs are detected at module initialization:

```
Error: Embed ID conflict: duplicate ID 'my-embed' registered twice.
First: my-embed (plugin: plugin-a),
Second: my-embed (plugin: plugin-b).
Embed IDs must be unique. Disable one embed or rename it.
```

**ID validation:**

- Happens when embed registry loads (app startup)
- Fails fast with clear error message
- Prevents silent overwriting of embedextensions
- Both offending embeds identified by ID and plugin

**Pattern-based conflicts:**

- Embeds use regex patterns, not exact paths
- Two embeds can theoretically match same content
- First registered pattern in registry wins (no conflict, by design)
- Mitigated by:
  - Clear pattern naming conventions
  - Core calendar/gallery use distinct patterns
  - Plugins should use unique, non-overlapping patterns
  - Document pattern usage in plugin specs

### Error Handling Distinction

The dispatcher distinguishes three scenarios:

1. **Single extension throws during claimPath()**

   - Caught and logged
   - Next extension tried
   - Not a conflict, just an error
   - Example: database query fails, validation error

2. **One extension claims path successfully, another throws**

   - Thrown error is logged
   - Claiming extension's response is returned
   - No conflict (only one successful claim)

3. **Multiple extensions claim path (all return Response)**
   - Conflict error is thrown
   - Not caught by dispatcher (propagates to middleware)
   - Middleware logs error and continues
   - Fail closed: neither response used

## Error Handling

### Public Routes - Single Extension Errors

Extension errors (e.g., database unavailable) are caught and logged:

```
Extension my-route (plugin my-plugin) failed to claim path /test:
  Error: Unable to connect to database
```

**Behavior:**

- Exception caught in dispatcher
- Error logged with extension ID and plugin name
- Dispatcher continues to next extension
- If no extension claims path: `NextResponse.next()` called
- App Router proceeds normally (dev pages, CMS, 404)
- Core functionality not blocked by plugin errors

### Embeds - Render Errors

Embed render errors leave the shortcode in the output:

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
