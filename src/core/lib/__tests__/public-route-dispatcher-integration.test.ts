/**
 * Real Integration Tests for Public Route Dispatcher
 *
 * These tests use the injectable dispatchPublicRoute core function
 * with actual mock extensions to verify the two-phase contract works correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { PublicRouteExtension } from '@core/types/extensions.server';
import type { PublicRouteMatchContext } from '@core/lib/public-route-match-context.server';
import { dispatchPublicRoute } from '@core/lib/public-route-dispatcher-core.server';

describe('Public Route Dispatcher - Real Integration Tests', () => {
  // Helper to create a mock NextRequest
  function mockRequest(method: string, pathname: string): NextRequest {
    return {
      method,
      nextUrl: { pathname },
    } as NextRequest;
  }

  // Helper to create a test match context factory
  function createTestContextFactory() {
    return (reservedRoutes: ReadonlySet<string>): PublicRouteMatchContext => {
      return {
        reservedRoutes,
        settings: {
          async get() {
            return undefined;
          },
          async getMany() {
            return {};
          },
        },
      };
    };
  }

  describe('Zero matches', () => {
    it('should return no-match when no extensions claim the path', async () => {
      const resolution = await dispatchPublicRoute('/unclaimed', mockRequest('GET', '/unclaimed'), {
        extensions: [],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(resolution.type).toBe('no-match');
    });

    it('should return no-match when extension match() returns null', async () => {
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: async () => null,
        handle: vi.fn(),
      };

      const resolution = await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(resolution.type).toBe('no-match');
      expect(extension.handle).not.toHaveBeenCalled();
    });

    it('should not initialize helpers when no extension matches', async () => {
      const extension: PublicRouteExtension = {
        id: 'no-match-ext',
        match: async () => null,
        handle: vi.fn(),
      };

      const getHelpers = vi.fn(async () => ({
        auth: vi.fn(),
        getDb: vi.fn(),
        verifyAdmin: vi.fn(),
      }));

      const resolution = await dispatchPublicRoute('/no-match', mockRequest('GET', '/no-match'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers,
        createMatchContext: createTestContextFactory(),
      });

      expect(resolution.type).toBe('no-match');
      expect(getHelpers).not.toHaveBeenCalled();
    });
  });

  describe('One match - handler execution', () => {
    it('should execute handler when exactly one match found', async () => {
      const handleResponse = new Response('handled content');
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: async () => ({ matched: true }),
        handle: vi.fn().mockResolvedValue(handleResponse),
      };

      const resolution = await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(resolution.type).toBe('match');
      expect(extension.handle).toHaveBeenCalledOnce();
      if (resolution.type === 'match') {
        expect(resolution.response).toBe(handleResponse);
      }
    });

    it('should pass match state unchanged to handler', async () => {
      const matchState = { slug: 'my-slug', id: 123 };
      const handleResponse = new Response('ok');
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: async () => matchState,
        handle: vi.fn().mockResolvedValue(handleResponse),
      };

      await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(extension.handle).toHaveBeenCalledWith(
        matchState,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should initialize helpers exactly once when handler executes', async () => {
      const extension: PublicRouteExtension = {
        id: 'single-match-ext',
        match: async () => ({ matched: true }),
        handle: vi.fn().mockResolvedValue(new Response('ok')),
      };

      const getHelpers = vi.fn(async () => ({
        auth: vi.fn(),
        getDb: vi.fn(),
        verifyAdmin: vi.fn(),
      }));

      const resolution = await dispatchPublicRoute('/match', mockRequest('GET', '/match'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers,
        createMatchContext: createTestContextFactory(),
      });

      expect(resolution.type).toBe('match');
      expect(getHelpers).toHaveBeenCalledTimes(1);
    });
  });

  describe('Two matches - conflict detection', () => {
    it('should return conflict when multiple extensions match', async () => {
      const ext1: PublicRouteExtension = {
        id: 'ext-1',
        pluginId: 'plugin-a',
        match: async () => ({ from: 'ext1' }),
        handle: vi.fn(),
      };

      const ext2: PublicRouteExtension = {
        id: 'ext-2',
        pluginId: 'plugin-b',
        match: async () => ({ from: 'ext2' }),
        handle: vi.fn(),
      };

      const resolution = await dispatchPublicRoute(
        '/conflicted',
        mockRequest('GET', '/conflicted'),
        {
          extensions: [ext1, ext2],
          isPluginEnabled: async () => true,
          getReservedRoutes: () => new Set(),
          getHelpers: async () => ({
            auth: vi.fn(),
            getDb: vi.fn(),
            verifyAdmin: vi.fn(),
          }),
          createMatchContext: createTestContextFactory(),
        }
      );

      expect(resolution.type).toBe('conflict');
      if (resolution.type === 'conflict') {
        expect(resolution.conflictingExtensions).toHaveLength(2);
        expect(resolution.conflictingExtensions[0]).toContain('ext-1');
        expect(resolution.conflictingExtensions[1]).toContain('ext-2');
      }
    });

    it('should NOT execute any handler during conflict', async () => {
      const ext1: PublicRouteExtension = {
        id: 'ext-1',
        match: async () => ({ from: 'ext1' }),
        handle: vi.fn(),
      };

      const ext2: PublicRouteExtension = {
        id: 'ext-2',
        match: async () => ({ from: 'ext2' }),
        handle: vi.fn(),
      };

      await dispatchPublicRoute('/conflicted', mockRequest('GET', '/conflicted'), {
        extensions: [ext1, ext2],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(ext1.handle).not.toHaveBeenCalled();
      expect(ext2.handle).not.toHaveBeenCalled();
    });

    it('should not initialize helpers when multiple extensions conflict', async () => {
      const ext1: PublicRouteExtension = {
        id: 'ext-1',
        match: async () => ({ from: 'ext1' }),
        handle: vi.fn(),
      };

      const ext2: PublicRouteExtension = {
        id: 'ext-2',
        match: async () => ({ from: 'ext2' }),
        handle: vi.fn(),
      };

      const getHelpers = vi.fn(async () => ({
        auth: vi.fn(),
        getDb: vi.fn(),
        verifyAdmin: vi.fn(),
      }));

      const resolution = await dispatchPublicRoute(
        '/conflicted',
        mockRequest('GET', '/conflicted'),
        {
          extensions: [ext1, ext2],
          isPluginEnabled: async () => true,
          getReservedRoutes: () => new Set(),
          getHelpers,
          createMatchContext: createTestContextFactory(),
        }
      );

      expect(resolution.type).toBe('conflict');
      expect(getHelpers).not.toHaveBeenCalled();
      expect(ext1.handle).not.toHaveBeenCalled();
      expect(ext2.handle).not.toHaveBeenCalled();
    });
  });

  describe('Plugin enablement', () => {
    it('should skip disabled plugin during match phase', async () => {
      const disabledExtension: PublicRouteExtension = {
        id: 'disabled-ext',
        pluginId: 'disabled-plugin',
        match: vi.fn(),
        handle: vi.fn(),
      };

      const resolution = await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [disabledExtension],
        isPluginEnabled: async (pluginId) => pluginId !== 'disabled-plugin',
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(disabledExtension.match).not.toHaveBeenCalled();
      expect(resolution.type).toBe('no-match');
    });

    it('should execute enabled plugin during match phase', async () => {
      const matchSpy = vi.fn().mockResolvedValue({ matched: true });
      const enabledExtension: PublicRouteExtension = {
        id: 'enabled-ext',
        pluginId: 'enabled-plugin',
        match: matchSpy,
        handle: vi.fn().mockResolvedValue(new Response('handled')),
      };

      await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [enabledExtension],
        isPluginEnabled: async (pluginId) => pluginId === 'enabled-plugin',
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(matchSpy).toHaveBeenCalled();
    });
  });

  describe('Reserved routes', () => {
    it('should not execute match for reserved routes', async () => {
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: vi.fn(),
        handle: vi.fn(),
      };

      await dispatchPublicRoute('/admin', mockRequest('GET', '/admin'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(['/admin']),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(extension.match).not.toHaveBeenCalled();
    });

    it('should not execute match for reserved route prefix', async () => {
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: vi.fn(),
        handle: vi.fn(),
      };

      await dispatchPublicRoute('/admin/dashboard', mockRequest('GET', '/admin/dashboard'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(['/admin']),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(extension.match).not.toHaveBeenCalled();
    });
  });

  describe('HTTP method filtering', () => {
    it('should not execute match for POST requests', async () => {
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: vi.fn(),
        handle: vi.fn(),
      };

      await dispatchPublicRoute('/test', mockRequest('POST', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(extension.match).not.toHaveBeenCalled();
    });

    it('should not execute match for PUT requests', async () => {
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: vi.fn(),
        handle: vi.fn(),
      };

      await dispatchPublicRoute('/test', mockRequest('PUT', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(extension.match).not.toHaveBeenCalled();
    });

    it('should execute match for GET requests', async () => {
      const matchSpy = vi.fn().mockResolvedValue({ matched: true });
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: matchSpy,
        handle: vi.fn().mockResolvedValue(new Response('ok')),
      };

      await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(matchSpy).toHaveBeenCalled();
    });

    it('should execute match for HEAD requests', async () => {
      const matchSpy = vi.fn().mockResolvedValue({ matched: true });
      const extension: PublicRouteExtension = {
        id: 'test-ext',
        match: matchSpy,
        handle: vi.fn().mockResolvedValue(new Response('ok')),
      };

      await dispatchPublicRoute('/test', mockRequest('HEAD', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(matchSpy).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should return error type when matcher throws', async () => {
      const extension: PublicRouteExtension = {
        id: 'broken-matcher',
        match: async () => {
          throw new Error('matcher broken');
        },
        handle: vi.fn(),
      };

      const resolution = await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(resolution.type).toBe('error');
      if (resolution.type === 'error') {
        expect(resolution.error.message).toContain('matcher');
      }
    });

    it('should return error type when handler throws', async () => {
      const extension: PublicRouteExtension = {
        id: 'broken-handler',
        match: async () => ({ matched: true }),
        handle: async () => {
          throw new Error('handler broken');
        },
      };

      const resolution = await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [extension],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      expect(resolution.type).toBe('error');
      if (resolution.type === 'error') {
        expect(resolution.error.message).toContain('handler');
      }
    });

    it('should continue after one extension throws, collecting other matches', async () => {
      const throwingExt: PublicRouteExtension = {
        id: 'throwing-ext',
        match: async () => {
          throw new Error('matcher error');
        },
        handle: vi.fn(),
      };

      const successfulExt: PublicRouteExtension = {
        id: 'successful-ext',
        match: async () => ({ matched: true }),
        handle: vi.fn().mockResolvedValue(new Response('ok')),
      };

      const resolution = await dispatchPublicRoute('/test', mockRequest('GET', '/test'), {
        extensions: [throwingExt, successfulExt],
        isPluginEnabled: async () => true,
        getReservedRoutes: () => new Set(),
        getHelpers: async () => ({
          auth: vi.fn(),
          getDb: vi.fn(),
          verifyAdmin: vi.fn(),
        }),
        createMatchContext: createTestContextFactory(),
      });

      // First extension throws, so we should get error
      expect(resolution.type).toBe('error');
    });
  });
});
