/**
 * Regression test for dispatcher dependency factory
 *
 * Prevents recurrence of the critical bug where createMatchContext
 * was missing from production wiring
 */

import { describe, it, expect, vi } from 'vitest';
import { createPublicRouteDispatcherDependencies } from '@core/lib/public-route-dispatcher.server';

const isPluginEnabledForRequest = vi.hoisted(() => vi.fn(async () => false));

vi.mock('@core/db/plugins-enabled', () => ({
  isPluginEnabledForRequest,
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

    const context = deps.createMatchContext!(new Set(['/admin']));

    expect(context.settings).toBeDefined();
    expect(context.settings.get).toBeDefined();
    expect(typeof context.settings.get).toBe('function');
  });

  it('should create match context with settings getMany', () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']));

    expect(context.settings).toBeDefined();
    expect(context.settings.getMany).toBeDefined();
    expect(typeof context.settings.getMany).toBe('function');
  });

  it('should not expose raw database access', () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']));

    // Should not have raw query or database methods
    expect((context as unknown as Record<string, unknown>).query).toBeUndefined();
    expect((context as unknown as Record<string, unknown>).db).toBeUndefined();
    expect((context as unknown as Record<string, unknown>).getDb).toBeUndefined();
  });

  it('should return null from settings.get in DB-free proxy context', async () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']));

    const value = await context.settings.get('plugin:test:enabled');
    expect(value).toBeNull();
  });

  it('should return empty object from settings.getMany in DB-free proxy context', async () => {
    const deps = createPublicRouteDispatcherDependencies();

    expect(deps.createMatchContext).toBeDefined();

    const context = deps.createMatchContext!(new Set(['/admin']));

    const values = await context.settings.getMany(['plugin:test:enabled']);
    expect(values).toEqual({});
  });

  it('should defer plugin eligibility to canonical runtime authority', async () => {
    const deps = createPublicRouteDispatcherDependencies();

    await expect(deps.isPluginEnabled('url-shortener')).resolves.toBe(false);
    expect(isPluginEnabledForRequest).toHaveBeenCalledWith('url-shortener');
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
