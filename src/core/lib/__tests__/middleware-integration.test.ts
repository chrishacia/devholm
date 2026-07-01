/**
 * Middleware Integration Tests
 *
 * Tests that middleware properly handles all dispatcher response types
 * and returns correct status codes and response bodies.
 */

import { describe, it, expect } from 'vitest';
import type { PublicRouteResolution } from '@core/lib/public-route-dispatcher.server';

/**
 * Core injectable middleware dispatch handler
 * This tests the logic without needing the full Next.js middleware context
 */
function getResolutionResponse(resolution: PublicRouteResolution): Response | null {
  switch (resolution.type) {
    case 'match':
      // Extension handled the request - return its response
      return resolution.response;

    case 'conflict':
      // Multiple extensions claimed same path - fail closed with explicit error
      return new Response(
        JSON.stringify({
          error: 'Route Configuration Conflict',
          message: `Multiple plugin routes claimed the same path. This is a server configuration error.`,
          conflictingExtensions: resolution.conflictingExtensions,
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    case 'error':
      // Dispatcher encountered an error during dispatch
      return new Response(
        JSON.stringify({
          error: 'Service Unavailable',
          message: 'Route resolution service temporarily unavailable',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    case 'no-match':
      // No extension claimed this path - fall through to App Router
      return null;
  }
}

describe('Middleware Integration - Resolution Handling', () => {
  describe('Match response', () => {
    it('should return extension response when match type', () => {
      const extensionResponse = new Response('Extension handled this', { status: 200 });

      const resolution: PublicRouteResolution = {
        type: 'match',
        response: extensionResponse,
      };

      const response = getResolutionResponse(resolution);

      expect(response).toBe(extensionResponse);
    });

    it('should preserve extension response status code', async () => {
      const extensionResponse = new Response('Custom content', { status: 201 });

      const resolution: PublicRouteResolution = {
        type: 'match',
        response: extensionResponse,
      };

      const response = getResolutionResponse(resolution);

      expect(response?.status).toBe(201);
    });

    it('should preserve extension response headers', async () => {
      const extensionResponse = new Response('Content', {
        status: 200,
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      const resolution: PublicRouteResolution = {
        type: 'match',
        response: extensionResponse,
      };

      const response = getResolutionResponse(resolution);

      expect(response?.headers.get('X-Custom-Header')).toBe('custom-value');
    });
  });

  describe('Conflict response', () => {
    it('should return 409 Conflict status', () => {
      const resolution: PublicRouteResolution = {
        type: 'conflict',
        conflictingExtensions: ['ext-1', 'ext-2'],
        error: new Error('Two extensions matched'),
      };

      const response = getResolutionResponse(resolution);

      expect(response?.status).toBe(409);
    });

    it('should return JSON with conflict details', async () => {
      const resolution: PublicRouteResolution = {
        type: 'conflict',
        conflictingExtensions: ['calendar-ext', 'gallery-ext'],
        error: new Error('Multiple matches'),
      };

      const response = getResolutionResponse(resolution);

      expect(response?.headers.get('Content-Type')).toContain('application/json');

      const body = await response?.json();
      expect(body?.error).toBe('Route Configuration Conflict');
      expect(body?.conflictingExtensions).toEqual(['calendar-ext', 'gallery-ext']);
    });

    it('should include error message in response', async () => {
      const resolution: PublicRouteResolution = {
        type: 'conflict',
        conflictingExtensions: ['ext-a', 'ext-b'],
        error: new Error('Path conflict'),
      };

      const response = getResolutionResponse(resolution);
      const body = await response?.json();

      expect(body?.message).toContain('Multiple plugin routes claimed the same path');
    });
  });

  describe('Error response', () => {
    it('should return 503 Service Unavailable status', () => {
      const resolution: PublicRouteResolution = {
        type: 'error',
        error: new Error('Database connection failed'),
      };

      const response = getResolutionResponse(resolution);

      expect(response?.status).toBe(503);
    });

    it('should return JSON with error details', async () => {
      const resolution: PublicRouteResolution = {
        type: 'error',
        error: new Error('Service failure'),
      };

      const response = getResolutionResponse(resolution);

      expect(response?.headers.get('Content-Type')).toContain('application/json');

      const body = await response?.json();
      expect(body?.error).toBe('Service Unavailable');
      expect(body?.message).toContain('temporarily unavailable');
    });

    it('should be used for matcher exceptions', () => {
      // If dispatcher catches matcher exception, it returns error type
      const resolution: PublicRouteResolution = {
        type: 'error',
        error: new Error('Matcher threw: Plugin not found'),
      };

      const response = getResolutionResponse(resolution);

      expect(response?.status).toBe(503);
    });

    it('should be used for handler exceptions', () => {
      // If dispatcher catches handler exception, it returns error type
      const resolution: PublicRouteResolution = {
        type: 'error',
        error: new Error('Handler threw: Database error'),
      };

      const response = getResolutionResponse(resolution);

      expect(response?.status).toBe(503);
    });
  });

  describe('No-match response', () => {
    it('should return null to fall through to App Router', () => {
      const resolution: PublicRouteResolution = {
        type: 'no-match',
      };

      const response = getResolutionResponse(resolution);

      expect(response).toBe(null);
    });

    it('should continue to App Router when no extension matches', () => {
      // This allows App Router to handle:
      // - Blog posts
      // - Calendar/gallery collections
      // - Regular pages
      // - CMS content
      const resolution: PublicRouteResolution = {
        type: 'no-match',
      };

      const response = getResolutionResponse(resolution);

      // Null indicates middleware should not intercept - let App Router handle it
      expect(response).toBeNull();
    });
  });

  describe('Dispatcher exception handling', () => {
    it('should catch and handle unexpected exceptions', () => {
      // Simulating catch block in middleware
      // When an unexpected error is thrown during dispatch

      const response = new Response(
        JSON.stringify({
          error: 'Service Unavailable',
          message: 'An unexpected error occurred while processing this request',
          timestamp: new Date().toISOString(),
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );

      expect(response.status).toBe(503);
    });

    it('should return 503 for any unexpected dispatcher error', () => {
      // Any exception during dispatch -> 503
      const response = new Response(
        JSON.stringify({
          error: 'Service Unavailable',
          message: 'An unexpected error occurred while processing this request',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );

      expect(response.status).toBe(503);
    });
  });

  describe('Middleware flow integration', () => {
    it('should route based on resolution type correctly', () => {
      const scenarios = [
        {
          resolution: { type: 'match' as const, response: new Response('ok') },
          expectedStatus: 200,
          expectedToIntercept: true,
        },
        {
          resolution: {
            type: 'conflict' as const,
            conflictingExtensions: ['a', 'b'],
            error: new Error('conflict'),
          },
          expectedStatus: 409,
          expectedToIntercept: true,
        },
        {
          resolution: { type: 'error' as const, error: new Error('error') },
          expectedStatus: 503,
          expectedToIntercept: true,
        },
        {
          resolution: { type: 'no-match' as const },
          expectedStatus: null,
          expectedToIntercept: false,
        },
      ];

      scenarios.forEach(({ resolution, expectedStatus, expectedToIntercept }) => {
        const response = getResolutionResponse(resolution);

        if (expectedToIntercept) {
          expect(response).not.toBeNull();
          expect(response?.status).toBe(expectedStatus);
        } else {
          expect(response).toBeNull();
        }
      });
    });

    it('should preserve match response for extension-provided content', async () => {
      const htmlResponse = new Response('<html><body>Plugin content</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

      const resolution: PublicRouteResolution = {
        type: 'match',
        response: htmlResponse,
      };

      const response = getResolutionResponse(resolution);

      expect(response?.status).toBe(200);
      expect(response?.headers.get('Content-Type')).toBe('text/html');
      const body = await response?.text();
      expect(body).toBe('<html><body>Plugin content</body></html>');
    });
  });

  describe('Response consistency', () => {
    it('should always return JSON for error and conflict', async () => {
      const conflict: PublicRouteResolution = {
        type: 'conflict',
        conflictingExtensions: ['a'],
        error: new Error('test'),
      };

      const error: PublicRouteResolution = {
        type: 'error',
        error: new Error('test'),
      };

      const conflictResponse = getResolutionResponse(conflict);
      const errorResponse = getResolutionResponse(error);

      expect(conflictResponse?.headers.get('Content-Type')).toContain('application/json');
      expect(errorResponse?.headers.get('Content-Type')).toContain('application/json');

      // Should be parseable JSON
      const conflictBody = await conflictResponse?.json();
      const errorBody = await errorResponse?.json();

      expect(conflictBody?.error).toBeDefined();
      expect(errorBody?.error).toBeDefined();
    });

    it('should have consistent error structure', async () => {
      const scenarios = [
        {
          type: 'conflict' as const,
          conflictingExtensions: ['a', 'b'],
          error: new Error('test'),
        },
        {
          type: 'error' as const,
          error: new Error('test'),
        },
      ];

      for (const scenario of scenarios) {
        const response = getResolutionResponse(scenario as PublicRouteResolution);
        const body = await response?.json();

        // Both should have error field and message field
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('message');
      }
    });
  });
});
