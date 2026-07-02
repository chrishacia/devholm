/**
 * Embed processor core - dependency-injectable for testing
 *
 * Extracted with all dependencies injected for full testability
 */

import type { EmbedExtensionConfig } from '@core/types/extensions.server';
import type { ExtensionHelpers } from '@core/types/extensions.server';

export interface EmbedProcessorDependencies {
  extensions: EmbedExtensionConfig[];
  isPluginEnabled: (pluginId: string | undefined) => Promise<boolean>;
  getHelpers: () => ExtensionHelpers;
  parseMarkdown: (content: string) => string;
}

/**
 * Core embed processor logic - fully dependency-injectable
 *
 * Process markdown content and render embed shortcodes
 */
export async function processEmbeds(
  content: string,
  dependencies: EmbedProcessorDependencies
): Promise<string> {
  let transformed = content;
  const helpers = dependencies.getHelpers();

  // Process each embed extension in order
  for (const extension of dependencies.extensions) {
    // Skip disabled plugins
    if (
      extension.pluginId &&
      !(await dependencies.isPluginEnabled(extension.pluginId).catch(() => false))
    ) {
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

  return dependencies.parseMarkdown(transformed);
}
