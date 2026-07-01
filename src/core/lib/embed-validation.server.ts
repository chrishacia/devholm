/**
 * Embed extension validation
 *
 * Ensures all embed extensions follow required patterns
 */

import type { EmbedExtensionConfig } from '@core/types/extensions.server';

/**
 * Validate embed extensions registry
 * - Check for duplicate IDs
 * - Check for duplicate shortcode names
 * - Check for non-global patterns
 * - Check for invalid shortcode names
 * - Throws on first validation error
 *
 * @throws Error if validation fails
 */
export function validateEmbedExtensions(extensions: EmbedExtensionConfig[]): void {
  const seenIds = new Map<string, EmbedExtensionConfig>();
  const seenShortcodes = new Map<string, EmbedExtensionConfig>();
  const patterns: Array<{
    embed: EmbedExtensionConfig;
    pattern: RegExp;
  }> = [];

  for (const embed of extensions) {
    // Check for duplicate IDs
    if (seenIds.has(embed.id)) {
      const first = seenIds.get(embed.id)!;
      const errorMessage =
        `Embed ID conflict: duplicate ID '${embed.id}' registered twice. ` +
        `First: ${first.id} (plugin: ${first.pluginId || 'core'}), ` +
        `Second: ${embed.id} (plugin: ${embed.pluginId || 'core'}). ` +
        `Embed IDs must be unique. Disable one embed or rename it.`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    seenIds.set(embed.id, embed);

    // Check for duplicate shortcodes
    if (seenShortcodes.has(embed.shortcode)) {
      const first = seenShortcodes.get(embed.shortcode)!;
      const errorMessage =
        `Embed shortcode conflict: duplicate shortcode '${embed.shortcode}' registered twice. ` +
        `First: ${first.id} (plugin: ${first.pluginId || 'core'}), ` +
        `Second: ${embed.id} (plugin: ${embed.pluginId || 'core'}). ` +
        `Shortcode names must be unique to prevent parsing ambiguity. Rename one shortcode.`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    seenShortcodes.set(embed.shortcode, embed);

    // Validate shortcode name format (alphanumeric, hyphen, underscore)
    if (!/^[a-z0-9_-]+$/i.test(embed.shortcode)) {
      const errorMessage =
        `Embed shortcode invalid: shortcode '${embed.shortcode}' for ${embed.id} ` +
        `(plugin: ${embed.pluginId || 'core'}) contains invalid characters. ` +
        `Shortcodes must be alphanumeric with hyphens and underscores only.`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    // Check pattern validity (must have global flag)
    if (!embed.pattern.global) {
      const errorMessage =
        `Embed pattern error: pattern for '${embed.id}' (plugin: ${embed.pluginId || 'core'}) ` +
        `does not have global flag. Pattern: ${embed.pattern.source}. ` +
        `All patterns must have 'g' flag for inline matching. Use /\\[...\\]/g instead of /^\\[...\\]$/.`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    patterns.push({ embed, pattern: embed.pattern });
  }

  /**
   * Pattern overlap detection (warns but doesn't fail startup)
   * Two patterns can coexist if they have distinct literal prefixes
   */
  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const { embed: embed1, pattern: pattern1 } = patterns[i];
      const { embed: embed2, pattern: pattern2 } = patterns[j];

      // Simple heuristic: both start with \[ so they could overlap
      if (
        pattern1.source.includes('[') &&
        pattern2.source.includes('[') &&
        !pattern1.source.includes('|') &&
        !pattern2.source.includes('|')
      ) {
        console.warn(
          `Embed pattern overlap warning: ${embed1.id} (plugin: ${embed1.pluginId || 'core'}) ` +
            `and ${embed2.id} (plugin: ${embed2.pluginId || 'core'}) have similar bracket patterns. ` +
            `This may cause unexpected behavior. Patterns: ${pattern1.source} vs ${pattern2.source}`
        );
      }
    }
  }
}
