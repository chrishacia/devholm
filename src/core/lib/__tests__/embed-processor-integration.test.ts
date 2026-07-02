/**
 * Real Integration Tests for Embed Processor
 *
 * These tests use the injectable processEmbeds core function
 * with actual embed extensions to verify transformations work correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EmbedExtensionConfig } from '@core/types/extensions.server';
import {
  processEmbeds,
  type EmbedProcessorDependencies,
} from '@core/lib/embed-processor-core.server';
import { validateEmbedExtensions } from '@core/lib/embed-validation.server';

describe('Embed Processor - Real Integration Tests', () => {
  // Helper to create dependencies
  function createDependencies(overrides?: Partial<EmbedProcessorDependencies>) {
    return {
      extensions: [],
      isPluginEnabled: async (pluginId: string | undefined) => pluginId !== 'disabled-plugin',
      getHelpers: () => ({
        auth: vi.fn(),
        getDb: vi.fn(),
        verifyAdmin: vi.fn(),
      }),
      parseMarkdown: (content: string) => content,
      ...overrides,
    };
  }

  describe('Successful transformations', () => {
    it('should replace shortcode with exact expected HTML', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'test-embed',
        shortcode: 'test',
        pattern: /\[test:([^\]]+)\]/g,
        render: async (match) => `<div class="test">${match[1]}</div>`,
      };

      const result = await processEmbeds('Hello [test:world]', {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).toBe('Hello <div class="test">world</div>');
    });

    it('should remove original shortcode after successful rendering', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'test-embed',
        shortcode: 'test',
        pattern: /\[test:([^\]]+)\]/g,
        render: async (match) => `<div>${match[1]}</div>`,
      };

      const result = await processEmbeds('[test:content]', {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).not.toContain('[test:content]');
      expect(result).toContain('<div>content</div>');
    });

    it('should replace multiple identical shortcode occurrences', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'quote-embed',
        shortcode: 'quote',
        pattern: /\[quote:([^\]]+)\]/g,
        render: async (match) => `<blockquote>${match[1]}</blockquote>`,
      };

      const content = '[quote:first] some text [quote:second]';
      const result = await processEmbeds(content, {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).toBe(
        '<blockquote>first</blockquote> some text <blockquote>second</blockquote>'
      );
      expect(result).not.toContain('[quote:');
    });

    it('should handle multiple shortcode types', async () => {
      const alerts: EmbedExtensionConfig = {
        id: 'alert-embed',
        shortcode: 'alert',
        pattern: /\[alert:([^\]]+)\]/g,
        render: async (match) => `<div class="alert">${match[1]}</div>`,
      };

      const notes: EmbedExtensionConfig = {
        id: 'note-embed',
        shortcode: 'note',
        pattern: /\[note:([^\]]+)\]/g,
        render: async (match) => `<div class="note">${match[1]}</div>`,
      };

      const content = '[alert:warning] [note:info]';
      const result = await processEmbeds(content, {
        ...createDependencies(),
        extensions: [alerts, notes],
      });

      expect(result).toContain('<div class="alert">warning</div>');
      expect(result).toContain('<div class="note">info</div>');
      expect(result).not.toContain('[alert:');
      expect(result).not.toContain('[note:');
    });
  });

  describe('Null return (shortcode preservation)', () => {
    it('should preserve exact shortcode when render returns null', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'optional-embed',
        shortcode: 'optional',
        pattern: /\[optional:([^\]]+)\]/g,
        render: async () => null, // Return null to preserve
      };

      const result = await processEmbeds('Text [optional:data] more', {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).toContain('[optional:data]');
    });
  });

  describe('Error handling', () => {
    it('should preserve exact shortcode when render throws', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'broken-embed',
        shortcode: 'broken',
        pattern: /\[broken:([^\]]+)\]/g,
        render: async () => {
          throw new Error('render error');
        },
      };

      const result = await processEmbeds('Start [broken:oops] end', {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).toContain('[broken:oops]');
      expect(result).toContain('Start');
      expect(result).toContain('end');
    });
  });

  describe('Plugin enablement', () => {
    it('should not call render for disabled plugin', async () => {
      const renderSpy = vi.fn().mockResolvedValue('<div>rendered</div>');

      const embed: EmbedExtensionConfig = {
        id: 'disabled-embed',
        pluginId: 'disabled-plugin',
        shortcode: 'disabled',
        pattern: /\[disabled:([^\]]+)\]/g,
        render: renderSpy,
      };

      await processEmbeds('[disabled:test]', {
        ...createDependencies({
          isPluginEnabled: async (pluginId) => pluginId !== 'disabled-plugin',
        }),
        extensions: [embed],
      });

      expect(renderSpy).not.toHaveBeenCalled();
    });

    it('should call render for enabled plugin', async () => {
      const renderSpy = vi.fn().mockResolvedValue('<div>rendered</div>');

      const embed: EmbedExtensionConfig = {
        id: 'enabled-embed',
        pluginId: 'enabled-plugin',
        shortcode: 'enabled',
        pattern: /\[enabled:([^\]]+)\]/g,
        render: renderSpy,
      };

      const result = await processEmbeds('[enabled:test]', {
        ...createDependencies({
          isPluginEnabled: async (pluginId) => pluginId === 'enabled-plugin',
        }),
        extensions: [embed],
      });

      expect(renderSpy).toHaveBeenCalled();
      expect(result).toBe('<div>rendered</div>');
    });
  });

  describe('Surrounding content preservation', () => {
    it('should preserve surrounding markdown', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'inline-embed',
        shortcode: 'inline',
        pattern: /\[inline:([^\]]+)\]/g,
        render: async (match) => `<span>${match[1]}</span>`,
      };

      const content = '# Heading\n\nParagraph with [inline:content] in it.\n\nMore text.';
      const result = await processEmbeds(content, {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).toContain('# Heading');
      expect(result).toContain('Paragraph with');
      expect(result).toContain('<span>content</span>');
      expect(result).toContain('More text.');
    });

    it('should handle embeds at start of content', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'start-embed',
        shortcode: 'start',
        pattern: /\[start:([^\]]+)\]/g,
        render: async (match) => `<header>${match[1]}</header>`,
      };

      const result = await processEmbeds('[start:title] followed by text', {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).toMatch(/^<header>title<\/header>/);
      expect(result).toContain('followed by text');
    });

    it('should handle embeds at end of content', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'end-embed',
        shortcode: 'end',
        pattern: /\[end:([^\]]+)\]/g,
        render: async (match) => `<footer>${match[1]}</footer>`,
      };

      const result = await processEmbeds('Text before [end:footer]', {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).toContain('Text before');
      expect(result).toMatch(/<footer>footer<\/footer>$/);
    });

    it('should handle only-shortcode content', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'only-embed',
        shortcode: 'only',
        pattern: /\[only:([^\]]+)\]/g,
        render: async (match) => `<div>${match[1]}</div>`,
      };

      const result = await processEmbeds('[only:content]', {
        ...createDependencies(),
        extensions: [embed],
      });

      expect(result).toBe('<div>content</div>');
      expect(result).not.toContain('[only:');
    });
  });

  describe('Markdown parsing after embeds', () => {
    it('should call parseMarkdown after embed processing', async () => {
      const parseMarkdownSpy = vi.fn((content) => `<p>${content}</p>`);

      const embed: EmbedExtensionConfig = {
        id: 'test-embed',
        shortcode: 'test',
        pattern: /\[test:([^\]]+)\]/g,
        render: async (match) => `<div>${match[1]}</div>`,
      };

      const result = await processEmbeds('content', {
        ...createDependencies({ parseMarkdown: parseMarkdownSpy }),
        extensions: [embed],
      });

      expect(parseMarkdownSpy).toHaveBeenCalledWith('content');
      expect(result).toBe('<p>content</p>');
    });
  });
});

/**
 * Embed Validator Tests
 *
 * Tests for the validateEmbedExtensions pure function
 */
describe('Embed Validator', () => {
  describe('Duplicate detection', () => {
    it('should throw on duplicate IDs', () => {
      const embeds: EmbedExtensionConfig[] = [
        {
          id: 'duplicate',
          shortcode: 'first',
          pattern: /\[first:([^\]]+)\]/g,
          render: async () => '<div>first</div>',
        },
        {
          id: 'duplicate',
          shortcode: 'second',
          pattern: /\[second:([^\]]+)\]/g,
          render: async () => '<div>second</div>',
        },
      ];

      expect(() => validateEmbedExtensions(embeds)).toThrow('duplicate ID');
    });

    it('should throw on duplicate shortcodes', () => {
      const embeds: EmbedExtensionConfig[] = [
        {
          id: 'embed-1',
          shortcode: 'same',
          pattern: /\[same:([^\]]+)\]/g,
          render: async () => '<div>1</div>',
        },
        {
          id: 'embed-2',
          shortcode: 'same',
          pattern: /\[same:([^\]]+)\]/g,
          render: async () => '<div>2</div>',
        },
      ];

      expect(() => validateEmbedExtensions(embeds)).toThrow('duplicate shortcode');
    });
  });

  describe('Pattern validation', () => {
    it('should throw on non-global pattern', () => {
      const embeds: EmbedExtensionConfig[] = [
        {
          id: 'no-global',
          shortcode: 'test',
          pattern: /\[test:([^\]]+)\]/, // Missing 'g' flag
          render: async () => '<div>test</div>',
        },
      ];

      expect(() => validateEmbedExtensions(embeds)).toThrow('global flag');
    });
  });

  describe('Valid registries', () => {
    it('should validate calendar and gallery embeds', () => {
      const calendarEmbed: EmbedExtensionConfig = {
        id: 'calendar',
        shortcode: 'calendar',
        pattern: /\[calendar\s+slug="([^"]+)"\]/g,
        render: async () => '<div>calendar</div>',
      };

      const galleryEmbed: EmbedExtensionConfig = {
        id: 'gallery',
        shortcode: 'gallery',
        pattern: /\[gallery\s+slug="([^"]+)"\]/g,
        render: async () => '<div>gallery</div>',
      };

      expect(() => validateEmbedExtensions([calendarEmbed, galleryEmbed])).not.toThrow();
    });

    it('should succeed with valid custom embeds', () => {
      const embeds: EmbedExtensionConfig[] = [
        {
          id: 'alert',
          shortcode: 'alert',
          pattern: /\[alert:([^\]]+)\]/g,
          render: async () => '<div>alert</div>',
        },
        {
          id: 'code-block',
          shortcode: 'code',
          pattern: /\[code:([^\]]+)\]/g,
          render: async () => '<div>code</div>',
        },
      ];

      expect(() => validateEmbedExtensions(embeds)).not.toThrow();
    });
  });
});
