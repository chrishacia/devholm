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

    // Collect all matches from current transformed content
    let matches: RegExpExecArray[] = [];
    try {
      // Pattern must be global to use matchAll
      if (!extension.pattern.global) {
        console.warn(
          `Embed extension ${extension.id} (plugin ${extension.pluginId || 'core'}) has non-global pattern. ` +
            `Patterns must have 'g' flag to match multiple occurrences.`
        );
        continue;
      }

      matches = Array.from(transformed.matchAll(extension.pattern));
    } catch (error) {
      /**
       * Pattern matching error (e.g., invalid regex)
       * Log and skip this extension
       */
      console.error(
        `Embed extension ${extension.id} (plugin ${extension.pluginId || 'core'}) pattern error:`,
        error
      );
      continue;
    }

    // Replace matches in reverse order to maintain correct indices
    // Process from end to start so earlier replacements don't shift positions
    for (let i = matches.length - 1; i >= 0; i--) {
      const matchResult = matches[i];
      try {
        const html = await extension.render(matchResult, content, helpers);
        if (html !== null) {
          // Safe replacement: use index positions to avoid double-replacements
          const before = transformed.substring(0, matchResult.index!);
          const after = transformed.substring(matchResult.index! + matchResult[0].length);
          transformed = before + html + after;
        }
        // If render returns null, leave shortcode as-is by not modifying transformed
      } catch (error) {
        /**
         * Broken embed handler:
         * - Extension.render() threw an error
         * - Log error for debugging
         * - Leave original shortcode in output (no modification)
         * - Continue with next match
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
