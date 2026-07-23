import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const runIsolatedPublicRouteMatch = vi.hoisted(() => vi.fn());
const runIsolatedPublicRouteHandle = vi.hoisted(() => vi.fn());
const extensionMatch = vi.hoisted(() => vi.fn());
const extensionHandle = vi.hoisted(() => vi.fn());
const isPluginEnabledForRequest = vi.hoisted(() => vi.fn());

vi.mock('@core/db/plugins-enabled', () => ({
  isPluginEnabledForRequest,
}));

vi.mock('@core/lib/plugin-capability-sandbox.server', () => ({
  evaluatePluginSandboxAccess: vi.fn(async () => ({
    allowed: true,
    reason: 'test-allow',
    deniedBy: [],
  })),
  recordPluginSandboxDecision: vi.fn(),
}));

vi.mock('@core/lib/reserved-routes.server', () => ({
  getReservedRoutes: vi.fn(() => new Set(['/', '/about', '/admin', '/api', '/static'])),
}));

vi.mock('@core/lib/plugin-isolation-runtime.server', () => ({
  runIsolatedPublicRouteMatch,
  runIsolatedPublicRouteHandle,
  shouldUseIsolatedRuntimeForExtension: vi.fn(
    ({ accessPolicy }) => accessPolicy?.runtimeOwner === 'plugin-extension'
  ),
}));

vi.mock('@user/extensions/public-routes', () => ({
  publicRouteExtensions: [
    {
      pluginId: 'url-shortener',
      id: 'url-shortener:redirect',
      accessPolicy: {
        scope: 'public',
        runtimeOwner: 'plugin-extension',
      },
      match: extensionMatch.mockImplementation(async (pathname: string) => {
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length === 2 && parts[0] === 's' && parts[1].length > 0) {
          return { code: parts[1] };
        }

        return null;
      }),
      handle: extensionHandle.mockImplementation(async () => new Response(null, { status: 204 })),
    },
  ],
}));

import { resolvePublicRouteExtension } from '@core/lib/public-route-dispatcher.server';

function makeRequest(pathname: string): NextRequest {
  return {
    method: 'GET',
    nextUrl: { pathname },
    headers: {
      get: () => null,
      has: () => false,
    },
    url: `http://localhost:3000${pathname}`,
  } as unknown as NextRequest;
}

describe('resolvePublicRouteExtension wrapper regressions', () => {
  beforeEach(() => {
    isPluginEnabledForRequest.mockResolvedValue(true);
    runIsolatedPublicRouteMatch.mockReset();
    runIsolatedPublicRouteHandle.mockReset();
    extensionMatch.mockClear();
    extensionHandle.mockClear();
    runIsolatedPublicRouteHandle.mockResolvedValue({
      response: new Response(null, {
        status: 200,
        headers: { 'x-middleware-rewrite': '/api/public/url-shortener/abc123' },
      }),
      meta: { executionId: 'exec-1', childPid: 12345 },
    });
  });

  it('treats homepage as reserved and bypasses isolated matching', async () => {
    const resolution = await resolvePublicRouteExtension('/', makeRequest('/'));

    expect(resolution.type).toBe('no-match');
    expect(runIsolatedPublicRouteMatch).not.toHaveBeenCalled();
  });

  it('keeps core filesystem routes reserved and bypasses isolated matching', async () => {
    const resolution = await resolvePublicRouteExtension('/about', makeRequest('/about'));

    expect(resolution.type).toBe('no-match');
    expect(runIsolatedPublicRouteMatch).not.toHaveBeenCalled();
  });

  it('does not fail unrelated unknown routes when isolated runtime match is unavailable', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(new Error('worker unavailable'));

    const resolution = await resolvePublicRouteExtension(
      '/no-such-page',
      makeRequest('/no-such-page')
    );

    expect(resolution.type).toBe('no-match');
    expect(runIsolatedPublicRouteMatch).not.toHaveBeenCalled();
  });

  it('keeps configured URL shortener routes claimable', async () => {
    runIsolatedPublicRouteMatch.mockResolvedValue({
      matched: true,
      match: { code: 'abc123' },
      meta: { executionId: 'exec-2', childPid: 12345 },
    });

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(runIsolatedPublicRouteMatch).toHaveBeenCalledTimes(1);
    expect(isPluginEnabledForRequest).toHaveBeenCalledWith('url-shortener');
    expect(resolution.type).toBe('match');
    if (resolution.type === 'match') {
      expect(resolution.response.headers.get('x-middleware-rewrite')).toContain(
        '/api/public/url-shortener/abc123'
      );
    }
  });

  it('keeps fail-closed behavior for genuine eligible plugin route matcher failures', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(new Error('worker unavailable'));

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(runIsolatedPublicRouteMatch).toHaveBeenCalledTimes(1);
    expect(resolution.type).toBe('error');
    if (resolution.type === 'error') {
      expect(resolution.error.message).toContain('worker unavailable');
    }
  });

  it('falls back to in-process claim when isolated matcher reports extension-not-found', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(
      new Error('isolated public-route match failed: extension-not-found: not found')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(runIsolatedPublicRouteMatch).toHaveBeenCalledTimes(1);
    expect(resolution.type).toBe('match');
  });

  it('falls back to in-process claim when isolated matcher times out', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(new Error('isolated plugin execution timed out'));

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(runIsolatedPublicRouteMatch).toHaveBeenCalledTimes(1);
    expect(runIsolatedPublicRouteHandle).toHaveBeenCalledTimes(1);
    expect(resolution.type).toBe('match');
  });

  it('falls back to in-process handler when isolated handler reports extension-not-found', async () => {
    runIsolatedPublicRouteMatch.mockResolvedValue({
      matched: true,
      match: { code: 'abc123' },
      meta: { executionId: 'exec-2', childPid: 12345 },
    });
    runIsolatedPublicRouteHandle.mockRejectedValue(
      new Error('isolated public-route handler failed: extension-not-found: not found')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(runIsolatedPublicRouteHandle).toHaveBeenCalledTimes(1);
    expect(extensionHandle).toHaveBeenCalledTimes(1);
    expect(resolution.type).toBe('match');
    if (resolution.type === 'match') {
      expect(resolution.response.status).toBe(204);
    }
  });

  it('falls back to in-process handler when isolated handler times out', async () => {
    runIsolatedPublicRouteMatch.mockResolvedValue({
      matched: true,
      match: { code: 'abc123' },
      meta: { executionId: 'exec-2', childPid: 12345 },
    });
    runIsolatedPublicRouteHandle.mockRejectedValue(
      new Error('isolated plugin execution timed out')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(runIsolatedPublicRouteHandle).toHaveBeenCalledTimes(1);
    expect(extensionHandle).toHaveBeenCalledTimes(1);
    expect(resolution.type).toBe('match');
    if (resolution.type === 'match') {
      expect(resolution.response.status).toBe(204);
    }
  });

  it('does not fall back when arbitrary message text mentions extension-not-found', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(
      new Error('worker unavailable: extension-not-found appeared in logs')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(resolution.type).toBe('error');
  });

  it('does not fall back when isolated matcher code is extension-not-found-extra', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(
      new Error('isolated public-route match failed: extension-not-found-extra: not found')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(resolution.type).toBe('error');
  });

  it('does not fall back when isolated handler code is extension-not-found-extra', async () => {
    runIsolatedPublicRouteMatch.mockResolvedValue({
      matched: true,
      match: { code: 'abc123' },
      meta: { executionId: 'exec-2', childPid: 12345 },
    });
    runIsolatedPublicRouteHandle.mockRejectedValue(
      new Error('isolated public-route handler failed: extension-not-found-extra: not found')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(extensionHandle).not.toHaveBeenCalled();
    expect(resolution.type).toBe('error');
  });

  it('does not fall back when isolated handler timeout-like error is not exact timeout', async () => {
    runIsolatedPublicRouteMatch.mockResolvedValue({
      matched: true,
      match: { code: 'abc123' },
      meta: { executionId: 'exec-2', childPid: 12345 },
    });
    runIsolatedPublicRouteHandle.mockRejectedValue(
      new Error('isolated plugin execution timed out while booting handler')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(extensionHandle).not.toHaveBeenCalled();
    expect(resolution.type).toBe('error');
  });

  it('does not fall back when isolated matcher fails with a different structured runtime code', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(
      new Error(
        'isolated public-route match failed: public-route-match-failure: worker unavailable'
      )
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(resolution.type).toBe('error');
  });

  it('does not fall back for malformed structured error strings', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(
      new Error('isolated public-route match failed extension-not-found not found')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(resolution.type).toBe('error');
  });

  it('does not fall back for timeout-like non-matching errors', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(
      new Error('isolated plugin execution timed out while booting')
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(resolution.type).toBe('error');
  });

  it('does not fall back for non-Error thrown values', async () => {
    runIsolatedPublicRouteMatch.mockRejectedValue(
      'isolated public-route match failed: extension-not-found: not found'
    );

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(resolution.type).toBe('error');
  });

  it('skips public route extension execution when plugin is disabled', async () => {
    isPluginEnabledForRequest.mockResolvedValue(false);

    const resolution = await resolvePublicRouteExtension('/s/abc123', makeRequest('/s/abc123'));

    expect(resolution.type).toBe('no-match');
    expect(runIsolatedPublicRouteMatch).not.toHaveBeenCalled();
    expect(extensionHandle).not.toHaveBeenCalled();
  });
});
