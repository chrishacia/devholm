import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import {
  runIsolatedApiExtension,
  runIsolatedPublicRouteHandle,
  runIsolatedPublicRouteMatch,
  testProbeIsolatedEnv,
} from '@core/lib/plugin-isolation-runtime.server';

function makeRequest(pathname: string, method: string = 'GET'): NextRequest {
  return new Request(`http://localhost:3000${pathname}`, {
    method,
    headers: new Headers(),
  }) as NextRequest;
}

describe('plugin isolation runtime', () => {
  const originalToggle = process.env.PLUGIN_ISOLATION_ENABLE_IN_TESTS;

  beforeAll(() => {
    process.env.PLUGIN_ISOLATION_ENABLE_IN_TESTS = 'true';
  });

  afterAll(() => {
    if (originalToggle === undefined) {
      delete process.env.PLUGIN_ISOLATION_ENABLE_IN_TESTS;
      return;
    }

    process.env.PLUGIN_ISOLATION_ENABLE_IN_TESTS = originalToggle;
  });

  it('executes plugin API handler in a child process', async () => {
    const result = await runIsolatedApiExtension({
      pluginId: 'url-shortener',
      extensionPath: '/api/url-shortener',
      method: 'GET',
      request: makeRequest('/api/url-shortener/overview'),
      pathSegments: ['url-shortener', 'overview'],
    });

    expect(result.meta.childPid).not.toBe(process.pid);
    expect(result.response.status).toBe(401);
  });

  it('executes plugin public-route match and handle in child processes', async () => {
    const matchResult = await runIsolatedPublicRouteMatch({
      pluginId: 'url-shortener',
      extensionId: 'url-shortener:redirect',
      pathname: '/s/abc123',
      request: makeRequest('/s/abc123'),
    });

    expect(matchResult.meta.childPid).not.toBe(process.pid);
    expect(matchResult.matched).toBe(true);

    const handled = await runIsolatedPublicRouteHandle({
      pluginId: 'url-shortener',
      extensionId: 'url-shortener:redirect',
      request: makeRequest('/s/abc123'),
      match: matchResult.match,
    });

    expect(handled.meta.childPid).not.toBe(process.pid);
    expect(handled.response.headers.get('x-middleware-rewrite')).toContain(
      '/api/public/url-shortener/abc123'
    );
  });

  it('does not inherit arbitrary parent environment variables', async () => {
    process.env.UNSAFE_PARENT_SECRET = 'should-not-leak';

    const values = await testProbeIsolatedEnv(['UNSAFE_PARENT_SECRET', 'NODE_ENV']);

    expect(values.UNSAFE_PARENT_SECRET).toBeNull();
    expect(typeof values.NODE_ENV).toBe('string');

    delete process.env.UNSAFE_PARENT_SECRET;
  });
});
