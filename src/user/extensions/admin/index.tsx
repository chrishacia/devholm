/**
 * Admin Extensions — Index
 * ========================
 *
 * Register your custom admin pages here.
 * Each extension adds a nav item to the admin sidebar and a page at the given route.
 *
 * The admin layout reads this array from devholm.config.ts and merges
 * your nav items into the sidebar at the specified position.
 *
 * Usage in devholm.config.ts:
 *   import { adminExtensions } from './src/user/extensions/admin';
 *   config.extensions.admin = adminExtensions;
 *
 * Example (uncomment and customize):
 * ─────────────────────────────────────────────────────────────────
 * import { SatelliteAlt } from '@mui/icons-material';
 * import type { AdminExtension } from '../../../src/core/types/extensions';
 *
 * export const adminExtensions: AdminExtension[] = [
 *   {
 *     navItem: {
 *       label: 'Telemetry',
 *       href: '/admin/telemetry',
 *       icon: <SatelliteAlt />,
 *       position: 'after:analytics',
 *     },
 *   },
 * ];
 * ─────────────────────────────────────────────────────────────────
 */

import type { AdminExtension } from '@core/types/extensions';

export const adminExtensions: AdminExtension[] = [
  // Add your custom admin extensions here
];