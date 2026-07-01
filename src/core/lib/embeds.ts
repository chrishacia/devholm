import { parseMarkdown } from './markdown';
import { isPluginEnabled } from '@/db/plugins';
import { embedExtensions } from '@user/extensions/embeds';
import { getExtensionHelpers } from '@core/lib/extension-helpers.server';
import { processEmbeds } from '@core/lib/embed-processor-core.server';

/**
 * Parse markdown content and render embed shortcodes
 *
 * Production wrapper that supplies real dependencies
 */
export async function parseMarkdownWithEmbeds(content: string) {
  return processEmbeds(content, {
    extensions: embedExtensions,
    isPluginEnabled,
    getHelpers: getExtensionHelpers,
    parseMarkdown,
  });
}

// Re-export for use in tests and module initialization
export { validateEmbedExtensions } from '@core/lib/embed-validation.server';
