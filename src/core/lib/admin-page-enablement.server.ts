/**
 * Admin page enablement helpers
 *
 * Small, testable functions used by extensions.server.ts to load admin pages
 * only if they are enabled.
 */

import React from 'react';
import type { AdminPageExtension } from '@core/types/extensions.server';

/**
 * Load an admin page component if it is enabled
 *
 * For plugin pages, checks enablement first.
 * For core pages (no pluginId), always loads.
 * Does not call loadPage for disabled plugins.
 *
 * @param extension - The admin page extension
 * @param isPluginEnabled - Async function that checks if a plugin is enabled
 * @returns The component function, or null if disabled
 */
export async function loadEnabledAdminPageComponent(
  extension: AdminPageExtension,
  isPluginEnabled: (pluginId: string | undefined) => Promise<boolean>
) {
  // Check enablement before loading
  if (extension.pluginId && !(await isPluginEnabled(extension.pluginId))) {
    return null;
  }

  // Enablement passed, load the component
  const loadedModule = await extension.loadPage();

  // Handle both { default: Component } and direct Component exports
  if (typeof loadedModule === 'object' && loadedModule !== null && 'default' in loadedModule) {
    return (loadedModule as { default: React.ComponentType }).default;
  }

  return loadedModule as React.ComponentType;
}

/**
 * Load admin page metadata if the page is enabled
 *
 * For plugin pages, checks enablement first.
 * For core pages (no pluginId), always loads.
 * Does not call getMetadata for disabled plugins.
 *
 * @param extension - The admin page extension
 * @param isPluginEnabled - Async function that checks if a plugin is enabled
 * @returns The metadata object, or undefined if disabled
 */
export async function loadEnabledAdminPageMetadata(
  extension: AdminPageExtension,
  isPluginEnabled: (pluginId: string | undefined) => Promise<boolean>
) {
  // Check enablement before loading
  if (extension.pluginId && !(await isPluginEnabled(extension.pluginId))) {
    return undefined;
  }

  // Enablement passed, load the metadata if available
  if (!extension.getMetadata) {
    return undefined;
  }

  return extension.getMetadata();
}
