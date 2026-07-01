import { parseMarkdown } from './markdown';
import { isPluginEnabled } from '@/db/plugins';
import { embedExtensions } from '@user/extensions/embeds';
import { getExtensionHelpers } from '@core/lib/extensions.server';

/**
 * Parse markdown content and render embed shortcodes
 *
 * Embed processing:
 * 1. Loop through embedExtensions in order
 * 2. For each enabled extension:
 *    - Try to match pattern against content
 *    - If match found:
 *      - Call render() with match and helpers
 *      - If render returns HTML: replace shortcode with HTML
 *      - If render returns null: leave shortcode as-is
 *      - If render throws: log error, leave shortcode as-is
 * 3. Return parsed markdown with rendered embeds
 *
 * Error handling:
 * - Extension disabled (pluginId not enabled): skipped
 * - Extension throws during render: logged, shortcode preserved
 * - Pattern matches but render returns null: shortcode preserved
 * - Database error inside render: caught, logged, shortcode preserved
 *
 * This ensures graceful degradation - a broken embed doesn't break the page.
 */
export async function parseMarkdownWithEmbeds(content: string) {
  const helpers = getExtensionHelpers();
  let transformed = content;

  // Process each embed extension in order
  for (const extension of embedExtensions) {
    // Skip disabled plugins
    if (extension.pluginId && !(await isPluginEnabled(extension.pluginId).catch(() => false))) {
      continue;
    }

    const regex = extension.pattern;

    // Process all matches for this extension
    // Note: Using exec() with regex.lastIndex would be more efficient for multiple matches
    // but pattern reset is handled by creating fresh regex or using matchAll
    const matches = [...content.matchAll(regex)];
    for (const matchResult of matches) {
      try {
        const html = await extension.render(matchResult, content, helpers);
        if (html) {
          transformed = transformed.replace(matchResult[0], html);
        } else {
          // Render returned null - leave shortcode as-is
          // This could mean: not found, not enabled, or intentional fallback
        }
      } catch (error) {
        /**
         * Broken embed handler:
         * - Extension.render() threw an error
         * - Log error for debugging
         * - Leave original shortcode in output
         * - Continue processing other embeds
         *
         * Examples:
         * - Database error when loading related data
         * - Invalid shortcode attributes
         * - Permission check failed
         */
        console.error(
          `Embed extension ${extension.id} (plugin ${extension.pluginId || 'core'}) failed to render shortcode:`,
          error
        );
        // Leave the shortcode as-is - don't break the page
      }
    }
  }

  return parseMarkdown(transformed);
}
