import type { DevPageDefinition } from '@core/types/dev-pages';
import { devholmPrivacyPage } from './privacy/definition';

/**
 * Register developer-defined pages here.
 *
 * Example:
 * {
 *   key: 'labs',
 *   path: '/labs',
 *   title: 'Labs',
 *   description: 'Interactive experiments and demos.',
 *   loadPage: () => import('./labs/LabsPage'),
 *   enabledByDefault: true,
 *   showInMainNavByDefault: true,
 *   includeInSitemapByDefault: true,
 * }
 */
export const devPageDefinitions: DevPageDefinition[] = devholmPrivacyPage
  ? [devholmPrivacyPage]
  : [];
