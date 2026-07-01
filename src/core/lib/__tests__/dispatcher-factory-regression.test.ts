/**
 * Regression test for dispatcher dependency factory
 *
 * Prevents recurrence of the critical bug where createMatchContext
 * was missing from production wiring
 */

import { describe, it, expect, vi } from 'vitest';
import { createPublicRouteDispatcherDependencies } from '@core/lib/public-route-dispatcher.server';

// Mock all production dependencies
vi.mock('@/db/plugins', () => ({
  isPluginEnabled: vi.fn(async () => true),
}));

vi.mock('@/db/settings', () => ({
  getSetting: vi.fn(async (key: string) => {
    const settings: Record<string, unknown> = {
      'plugin:test:enabled': true,
    };
    return settings[key];
  }),
  getSettings: vi.fn(async (keys: string[]) => {
    const settings: Record<string, unknown> = {
      'plugin:test:enabled': true,
    };
    return keys.reduce(
      (acc, key) => {
        if (key in settings) {
          acc[key] = settings[key];
        }
        return acc;
      },
      {} as Record<string, unknown>
    );
  }),
}));

vi.mock('@core/lib/extension-helpers.server', () => ({
  getExtensionHelpers: vi.fn(() => ({
    auth: vi.fn(),
    getDb: vi.fn(),
    verifyAdmin: vi.fn(),
  })),
}));

vi.mock('@user/extensions/public-routes', () => ({
  publicRouteExtensions: [],
}));

vi.mock('@core/lib/reserved-routes.server', () => ({
  getReservedRoutes: vi.fn(() => new Set(['/admin', '/api', '/static'])),
}));

describe('createPublicRouteDispatcherDependencies - Regression Test', () => {
  it('should provide createMatchContext factory', () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();
    expect(typeof deps.createMatchContext).toBe('function');
  });

  it('should create match context with settings getter', () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']), {
      auth: vi.fn(),
      getDb: vi.fn(),
      verifyAdmin: vi.fn(),
    });

    expect(context.settings).toBeDefined();
    expect(context.settings.get).toBeDefined();
    expect(typeof context.settings.get).toBe('function');
  });

  it('should create match context with settings getMany', () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']), {
      auth: vi.fn(),
      getDb: vi.fn(),
      verifyAdmin: vi.fn(),
    });

    expect(context.settings).toBeDefined();
    expect(context.settings.getMany).toBeDefined();
    expect(typeof context.settings.getMany).toBe('function');
  });

  it('should not expose raw database access', () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']), {
      auth: vi.fn(),
      getDb: vi.fn(),
      verifyAdmin: vi.fn(),
    });

    // Should not have raw query or database methods
    expect((context as unknown as Record<string, unknown>).query).toBeUndefined();
    expect((context as unknown as Record<string, unknown>).db).toBeUndefined();
    expect((context as unknown as Record<string, unknown>).getDb).toBeUndefined();
  });

  it('should read mocked settings through context', async () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']), {
      auth: vi.fn(),
      getDb: vi.fn(),
      verifyAdmin: vi.fn(),
    });

    const value = await context.settings.get('plugin:test:enabled');
    expect(value).toBe(true);
  });

  it('should read multiple settings through getMany', async () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']), {
      auth: vi.fn(),
      getDb: vi.fn(),
      verifyAdmin: vi.fn(),
    });

    const values = await context.settings.getMany(['plugin:test:enabled']);
    expect(values).toEqual({ 'plugin:test:enabled': true });
  });

  it('should provide all required dispatcher dependencies', () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.extensions).toBeDefined();
    expect(Array.isArray(deps.extensions)).toBe(true);
    expect(deps.isPluginEnabled).toBeDefined();
    expect(typeof deps.isPluginEnabled).toBe('function');
    expect(deps.getReservedRoutes).toBeDefined();
    expect(typeof deps.getReservedRoutes).toBe('function');
    expect(deps.getHelpers).toBeDefined();
    expect(typeof deps.getHelpers).toBe('function');
  });
});
