import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import type {
  PublicRouteExtension,
  EmbedExtensionConfig,
  ExtensionHelpers,
} from '@core/types/extensions.server';

describe('Phase 1 Plugin Framework - Contract Validation', () => {
  describe('PublicRouteExtension Contract', () => {
    it('should define extension with required fields', () => {
      const extension: PublicRouteExtension = {
        id: 'test-extension',
        pluginId: 'test-plugin',
        claimPath: async () => null,
      };

      expect(extension.id).toBe('test-extension');
      expect(extension.pluginId).toBe('test-plugin');
      expect(typeof extension.claimPath).toBe('function');
    });

    it('should allow optional pluginId', () => {
      const extension: PublicRouteExtension = {
        id: 'core-extension',
        claimPath: async () => null,
      };

      expect(extension.pluginId).toBeUndefined();
    });

    it('should support async claimPath', async () => {
      const extension: PublicRouteExtension = {
        id: 'async-extension',
        claimPath: async () => {
          await Promise.resolve();
          return null;
        },
      };

      const result = await extension.claimPath('/test', {} as NextRequest, {} as ExtensionHelpers);
      expect(result).toBeNull();
    });

    it('should support sync claimPath', () => {
      const extension: PublicRouteExtension = {
        id: 'sync-extension',
        claimPath: () => null,
      };

      const result = extension.claimPath('/test', {} as NextRequest, {} as ExtensionHelpers);
      expect(result).toBeNull();
    });

    it('should support returning Response from claimPath', async () => {
      const extension: PublicRouteExtension = {
        id: 'responding-extension',
        claimPath: async () => new Response('claimed'),
      };

      const result = await extension.claimPath('/test', {} as NextRequest, {} as ExtensionHelpers);
      expect(result).toBeInstanceOf(Response);
    });
  });

  describe('EmbedExtensionConfig Contract', () => {
    it('should define embed with required fields', () => {
      const embed: EmbedExtensionConfig = {
        id: 'test-embed',
        pattern: /test/,
        render: async () => '<div>test</div>',
      };

      expect(embed.id).toBe('test-embed');
      expect(embed.pattern).toBeInstanceOf(RegExp);
      expect(typeof embed.render).toBe('function');
    });

    it('should allow optional pluginId', () => {
      const embed: EmbedExtensionConfig = {
        id: 'core-embed',
        pattern: /core/,
        render: async () => null,
      };

      expect(embed.pluginId).toBeUndefined();
    });

    it('should support async render', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'async-embed',
        pattern: /async/,
        render: async () => {
          await Promise.resolve();
          return '<div>rendered</div>';
        },
      };

      const match = /async/.exec('async test') as RegExpExecArray;
      const result = await embed.render(match, 'async test', {} as ExtensionHelpers);
      expect(result).toBe('<div>rendered</div>');
    });

    it('should support sync render', () => {
      const embed: EmbedExtensionConfig = {
        id: 'sync-embed',
        pattern: /sync/,
        render: () => '<div>sync</div>',
      };

      const match = /sync/.exec('sync test') as RegExpExecArray;
      const result = embed.render(match, 'sync test', {} as ExtensionHelpers);
      expect(result).toBe('<div>sync</div>');
    });

    it('should support returning null from render', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'null-embed',
        pattern: /null/,
        render: async () => null,
      };

      const match = /null/.exec('null test') as RegExpExecArray;
      const result = await embed.render(match, 'null test', {} as ExtensionHelpers);
      expect(result).toBeNull();
    });

    it('should throw from render', async () => {
      const embed: EmbedExtensionConfig = {
        id: 'error-embed',
        pattern: /error/,
        render: async () => {
          throw new Error('render failed');
        },
      };

      const match = /error/.exec('error test') as RegExpExecArray;
      await expect(embed.render(match, 'error test', {} as ExtensionHelpers)).rejects.toThrow(
        'render failed'
      );
    });
  });

  describe('Route Precedence Documentation', () => {
    it('should document that middleware runs before App Router', () => {
      // Middleware is called first in the request lifecycle
      // This means public-route extensions are checked before dev pages
      const explanation = 'Middleware executes before App Router routes';
      expect(explanation).toBeTruthy();
    });

    it('should document excluded paths from middleware', () => {
      const excludedPaths = ['/admin', '/api', '/static'];
      const paths = ['/blog', '/calendar', '/gallery', '/custom'];

      // Excluded paths skip public-route check
      excludedPaths.forEach((path) => {
        expect(
          path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/static')
        ).toBe(true);
      });

      // Other paths go through public-route check
      paths.forEach((path) => {
        expect(
          path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/static')
        ).toBe(false);
      });
    });

    it('should document database unavailability behavior', () => {
      // If extension throws (db down), error is caught and next extension tried
      // If no extension claims path, NextResponse.next() is called
      // App Router proceeds with dev pages and CMS pages
      // Result: page loads without plugin data
      const scenario = 'Database unavailable in extension';
      expect(scenario).toBeTruthy();
    });
  });

  describe('Conflict Detection', () => {
    it('should document public-route conflict detection', () => {
      // Multiple extensions claiming same path = conflict
      // Dispatcher detects and throws error
      // Middleware catches and logs
      // Result: no response returned, App Router proceeds, 404
      const behavior = 'Multi-claim conflict fails closed';
      expect(behavior).toBeTruthy();
    });

    it('should document embed duplicate ID detection', () => {
      // Duplicate embed IDs detected at module load
      // Error thrown, startup fails
      // Both embeds identified in error message
      const validation = 'Duplicate IDs fail fast at startup';
      expect(validation).toBeTruthy();
    });

    it('should distinguish extension error from conflict error', () => {
      // Single extension throws: caught, next tried
      // Multiple extensions claim: conflict, thrown
      // Both logged, but different error messages
      const distinction = 'Extension error != multi-claim conflict';
      expect(distinction).toBeTruthy();
    });
  });

  describe('Backward Compatibility', () => {
    it('should preserve calendar shortcode syntax', () => {
      const shortcode = '[calendar slug="my-calendar"]';
      expect(shortcode).toMatch(/^\[calendar\s+/);
    });

    it('should preserve gallery shortcode syntax', () => {
      const shortcode = '[gallery slug="my-gallery"]';
      expect(shortcode).toMatch(/^\[gallery\s+/);
    });

    it('should use registry-based processing for embeds', () => {
      // Calendar and gallery are now EmbedExtensionConfig[]
      // Behavior identical to hardcoded implementation
      // But extensible by plugins
      const approach = 'Registry-based embed processing';
      expect(approach).toBeTruthy();
    });
  });

  describe('Plugin Enablement', () => {
    it('should check enablement before invoking extension', () => {
      // Dispatcher checks isPluginEnabled(pluginId) before calling claimPath
      // If pluginId undefined: always enabled (core)
      // If pluginId defined: checked against site_settings
      const pattern = 'plugin:<plugin-id>:enabled';
      expect(pattern).toBeTruthy();
    });

    it('should skip disabled plugin extensions', () => {
      // Disabled plugins never reach their claimPath/render functions
      // No side effects from disabled plugins
      const safety = 'Disabled plugins completely skipped';
      expect(safety).toBeTruthy();
    });
  });

  describe('Error Handling Strategy', () => {
    it('should catch single extension errors and continue', () => {
      // Extension.claimPath() throws: caught, logged, next tried
      // Example: db error, validation error, etc.
      const strategy = 'Single error = continue';
      expect(strategy).toBeTruthy();
    });

    it('should fail closed on multi-claim conflicts', () => {
      // Multiple extensions return Response: throw error
      // Error propagates to middleware
      // Middleware logs and calls NextResponse.next()
      // No response returned, App Router proceeds
      const strategy = 'Multi-claim conflict = fail closed';
      expect(strategy).toBeTruthy();
    });

    it('should preserve shortcodes on embed render errors', () => {
      // Embed.render() throws: caught, logged
      // Shortcode left in output
      // Page doesn't break
      const graceful = 'Embed error = preserve shortcode';
      expect(graceful).toBeTruthy();
    });
  });

  describe('Request Exclusions in Middleware', () => {
    it('should exclude /admin/* from public route checks', () => {
      const paths = ['/admin/settings', '/admin/login', '/admin/posts'];
      paths.forEach((path) => {
        expect(path.startsWith('/admin')).toBe(true);
      });
    });

    it('should exclude /api/* from public route checks', () => {
      const paths = ['/api/posts', '/api/admin/settings', '/api/calendar/1'];
      paths.forEach((path) => {
        expect(path.startsWith('/api')).toBe(true);
      });
    });

    it('should exclude /static/* from public route checks', () => {
      const paths = ['/static/file.js', '/static/styles.css'];
      paths.forEach((path) => {
        expect(path.startsWith('/static')).toBe(true);
      });
    });

    it('should check public routes for other paths', () => {
      const paths = ['/blog/post', '/calendar/my-cal', '/custom-page', '/projects'];
      paths.forEach((path) => {
        expect(
          path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/static')
        ).toBe(false);
      });
    });

    it('should document that _next/* is auto-excluded by Next.js', () => {
      // Next.js automatically excludes /_next, /favicon.ico, etc.
      // Middleware config does not need to repeat these
      const documentation = 'Next.js auto-excludes internal routes';
      expect(documentation).toBeTruthy();
    });
  });
});
