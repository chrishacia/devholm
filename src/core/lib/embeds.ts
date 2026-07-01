import { parseMarkdown } from './markdown';
import { isPluginEnabled } from '@/db/plugins';
import { embedExtensions } from '@user/extensions/embeds';
import { getExtensionHelpers } from '@core/lib/extensions.server';

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
    let match: RegExpExecArray | null;

    // Process all matches for this extension
    while ((match = regex.exec(content)) !== null) {
      try {
        const html = await extension.render(match, content, helpers);
        if (html) {
          transformed = transformed.replace(match[0], html);
        }
      } catch (error) {
        console.error(
          `Embed extension ${extension.id} (plugin ${extension.pluginId || 'core'}) failed:`,
          error
        );
        // Leave the shortcode as-is on error
      }
    }
  }

  return parseMarkdown(transformed);
}
