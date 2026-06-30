/**
 * resolveView — Core View Resolution
 * ===================================
 *
 * Returns the component to use for a given page view name.
 * If the user has ejected and registered an override in devholm.config.ts,
 * the user's override is returned. Otherwise, the core view is used.
 *
 * Usage (in a page.tsx):
 * ```ts
 * import { resolveView } from '@core/lib/resolveView';
 * import CoreBlogView from '@core/views/blog/BlogView';
 * import config from '@config';
 *
 * const BlogView = await resolveView('blog', CoreBlogView, config);
 * ```
 *
 * For server components, call with `await`. For client components, use
 * dynamic() from next/dynamic with the resolved override.
 */

import type { ViewName } from '@core/types/extensions';
import type React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = React.ComponentType<any>;

interface ConfigWithViews {
  views?: Partial<Record<ViewName, () => Promise<{ default: AnyComponent }>>>;
}

/**
 * Resolves which component to render for a given view name.
 *
 * @param viewName - The logical name of the view (e.g. 'blog', 'about')
 * @param CoreView - The built-in core component to fall back to
 * @param config   - The devholm.config.ts export
 * @returns        - The component to render (user override or core)
 */
export async function resolveView(
  viewName: ViewName,
  CoreView: AnyComponent,
  config: ConfigWithViews
): Promise<AnyComponent> {
  const override = config.views?.[viewName];
  if (override) {
    const mod = await override();
    return mod.default;
  }
  return CoreView;
}
