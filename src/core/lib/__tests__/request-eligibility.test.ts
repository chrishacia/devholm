/**
 * Tests for request eligibility helper
 *
 * Verify that shouldResolvePublicRoute correctly identifies which requests
 * should go through plugin public-route resolution
 */

import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import { shouldResolvePublicRoute } from '@core/lib/request-eligibility.server';

interface MockHeaders {
  [key: string]: string | undefined;
}

function createMockRequest(
  pathname: string,
  method: string = 'GET',
  headers: MockHeaders = {}
): NextRequest {
  const url = new URL(`http://localhost${pathname}`);
  const req = {
    nextUrl: url,
    method,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
      has: (key: string) => key.toLowerCase() in headers,
    },
  } as NextRequest;
  return req;
}

describe('shouldResolvePublicRoute', () => {
  describe('HTTP method checks', () => {
    it('should allow GET requests', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/blog/post', 'GET'))).toBe(true);
    });

    it('should allow HEAD requests', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/blog/post', 'HEAD'))).toBe(true);
    });

    it('should reject POST requests', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/blog/post', 'POST'))).toBe(false);
    });

    it('should reject PUT requests', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/api/data', 'PUT'))).toBe(false);
    });

    it('should reject DELETE requests', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/api/data', 'DELETE'))).toBe(false);
    });
  });

  describe('Reserved path checks', () => {
    it('should reject /api paths', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/api/users', 'GET'))).toBe(false);
    });

    it('should allow paths similar to /api like /apiary', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/apiary', 'GET'))).toBe(true);
    });

    it('should reject /admin paths', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/admin/settings', 'GET'))).toBe(false);
    });

    it('should allow paths similar to /admin like /admin-panel', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/admin-panel', 'GET'))).toBe(true);
    });

    it('should reject /static paths', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/static/file.txt', 'GET'))).toBe(false);
    });

    it('should allow paths similar to /static like /static-site', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/static-site', 'GET'))).toBe(true);
    });
  });

  describe('RSC request checks', () => {
    it('should reject requests with rsc=1 header', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/blog/post', 'GET', { rsc: '1' }))).toBe(
        false
      );
    });

    it('should reject requests with next-action header', () => {
      expect(
        shouldResolvePublicRoute(createMockRequest('/blog/post', 'GET', { 'next-action': 'true' }))
      ).toBe(false);
    });

    it('should allow requests without RSC headers', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/blog/post', 'GET'))).toBe(true);
    });
  });

  describe('Prefetch request checks', () => {
    it('should reject requests with purpose=prefetch header', () => {
      expect(
        shouldResolvePublicRoute(createMockRequest('/blog/post', 'GET', { purpose: 'prefetch' }))
      ).toBe(false);
    });

    it('should reject requests with next-router-prefetch header', () => {
      expect(
        shouldResolvePublicRoute(
          createMockRequest('/blog/post', 'GET', { 'next-router-prefetch': '1' })
        )
      ).toBe(false);
    });

    it('should allow requests without prefetch headers', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/blog/post', 'GET'))).toBe(true);
    });
  });

  describe('Asset extension checks', () => {
    it('should reject .svg files', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/images/logo.svg', 'GET'))).toBe(false);
    });

    it('should reject .png files', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/images/icon.png', 'GET'))).toBe(false);
    });

    it('should reject .webp files', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/images/photo.webp', 'GET'))).toBe(false);
    });

    it('should reject .woff2 font files', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/fonts/sans.woff2', 'GET'))).toBe(false);
    });

    it('should reject .webmanifest files', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/manifest.webmanifest', 'GET'))).toBe(
        false
      );
    });

    it('should allow non-asset paths', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/blog/post', 'GET'))).toBe(true);
    });
  });

  describe('Combination checks', () => {
    it('should allow normal extension route', () => {
      expect(shouldResolvePublicRoute(createMockRequest('/blog/my-post', 'GET'))).toBe(true);
    });

    it('should reject route with multiple disqualifying factors', () => {
      // POST request to /api should reject (both method and reserved path)
      expect(shouldResolvePublicRoute(createMockRequest('/api/users', 'POST'))).toBe(false);
    });
  });
});
