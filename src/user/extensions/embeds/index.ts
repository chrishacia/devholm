/**
 * Embed extensions registry
 *
 * Combines core embeds (calendar, gallery) with plugin embeds.
 * Extensions are processed in order; first matching pattern wins.
 *
 * VALIDATION: Duplicate embed IDs are detected at initialization.
 * If two embeds have the same ID, a detailed error is logged identifying both.
 *
 * Example plugin embed (Phase 2 - URL Shortener):
 *
 * const urlShortenerEmbeds: EmbedExtensionConfig[] = [
 *   {
 *     pluginId: 'url-shortener',
 *     id: 'shorturl-stats-embed',
 *     pattern: /^\[shorturl-stats\s+([^\]]+)\]$/,
 *     render: async (match, content, helpers) => {
 *       const code = match[1];
 *       const db = helpers.getDb();
 *       const shortUrl = await db.selectFrom('shortUrls')
 *         .select(['id', 'code', 'clicks', 'createdAt'])
 *         .where('code', '=', code)
 *         .executeTakeFirst();
 *
 *       if (!shortUrl) {
 *         return `<div class="embed-error">Short URL '${escapeHtml(code)}' not found.</div>`;
 *       }
 *
 *       return `<section class="devholm-embed shorturl-stats">
 *         <h4>${escapeHtml(code)}</h4>
 *         <p>Clicks: ${shortUrl.clicks}</p>
 *       </section>`;
 *     },
 *   },
 * ];
 */

import type { EmbedExtensionConfig } from '@core/types/extensions.server';
import { calendarEmbeds } from '@core/lib/embeds/calendar';
import { galleryEmbeds } from '@core/lib/embeds/gallery';

// Plugin embeds registry (empty for now, populated in Phase 2+)
const pluginEmbeds: EmbedExtensionConfig[] = [];

/**
 * Combined registry of all embed extensions
 * Order matters: first matching pattern wins
 */
export const embedExtensions: EmbedExtensionConfig[] = [
  ...calendarEmbeds,
  ...galleryEmbeds,
  ...pluginEmbeds,
];

/**
 * Validate embed registry at initialization
 * - Check for duplicate IDs
 * - Check for duplicate shortcode names
 * - Check for overlapping patterns (can cause silent conflicts)
 * - Log detailed errors identifying both conflicting entries
 * - Fail startup if conflicts found (prevent silent issues)
 */
function validateEmbedRegistry() {
  const seenIds = new Map<string, EmbedExtensionConfig>();
  const seenShortcodes = new Map<string, EmbedExtensionConfig>();
  const patterns: Array<{
    embed: EmbedExtensionConfig;
    pattern: RegExp;
  }> = [];

  for (const embed of embedExtensions) {
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
   * Example: /\[calendar:/ and /\[gallery:/ are safe
   * Example: /\[(\w+):/ and /\[calendar:/ would overlap
   * This is approximate - detailed regex analysis would be more thorough
   */
  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const { embed: embed1, pattern: pattern1 } = patterns[i];
      const { embed: embed2, pattern: pattern2 } = patterns[j];

      // Simple heuristic: both start with \[ so they could overlap
      // This catches most real conflicts
      if (
        pattern1.source.includes('[') &&
        pattern2.source.includes('[') &&
        !pattern1.source.includes('|') &&
        !pattern2.source.includes('|')
      ) {
        // Could potentially overlap - issue warning
        console.warn(
          `Embed pattern overlap warning: ${embed1.id} (plugin: ${embed1.pluginId || 'core'}) ` +
            `and ${embed2.id} (plugin: ${embed2.pluginId || 'core'}) have similar bracket patterns. ` +
            `This may cause unexpected behavior. Patterns: ${pattern1.source} vs ${pattern2.source}`
        );
      }
    }
  }
}

// Validate on module load
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production') {
  try {
    validateEmbedRegistry();
  } catch (error) {
    console.error('Embed registry validation failed:', error);
    // Re-throw to fail startup
    throw error;
  }
}
