/**
 * Tests for middleware response builder
 *
 * Verifies that public route resolutions are correctly converted
 * to HTTP responses for the middleware.
 */

import { describe, it, expect } from 'vitest';
import { responseForPublicRouteResolution } from '@core/lib/public-route-resolution-response.server';
import type { PublicRouteResolution } from '@core/lib/public-route-dispatcher.server';

describe('Middleware Response Builder', () => {
  describe('Match response', () => {
    it('should return the extension response for match', async () => {
      const extensionResponse = new Response('Extension content', {
        status: 200,
        headers: { 'X-Source': 'extension' },
      });

      const resolution: PublicRouteResolution = {
        type: 'match',
        response: extensionResponse,
      };

      const response = responseForPublicRouteResolution('/test', resolution);

      expect(response).toBe(extensionResponse);
      expect(response?.status).toBe(200);
      expect(response?.headers.get('X-Source')).toBe('extension');
    });
  });

  describe('Conflict response', () => {
    it('should return 409 for conflict', async () => {
      const resolution: PublicRouteResolution = {
        type: 'conflict',
        conflictingExtensions: ['ext1', 'ext2'],
        error: new Error('Conflict detected'),
      };

      const response = responseForPublicRouteResolution('/test', resolution);

      expect(response?.status).toBe(409);
      expect(response?.headers.get('Content-Type')).toBe('application/json');

      const body = await response!.json();
      expect(body).toEqual({
        error: 'Route Configuration Conflict',
        message: expect.stringContaining('Multiple plugin routes claimed the same path'),
        conflictingExtensions: ['ext1', 'ext2'],
      });
    });

    it('should include pathname in conflict message', async () => {
      const resolution: PublicRouteResolution = {
        type: 'conflict',
        conflictingExtensions: ['a', 'b'],
        error: new Error('Test'),
      };

      const response = responseForPublicRouteResolution('/special/path', resolution);
      const body = await response!.json();

      expect(body.message).toContain('/special/path');
    });
  });

  describe('Error response', () => {
    it('should return 503 for error', async () => {
      const resolution: PublicRouteResolution = {
        type: 'error',
        error: new Error('Database unavailable'),
      };

      const response = responseForPublicRouteResolution('/test', resolution);

      expect(response?.status).toBe(503);
      expect(response?.headers.get('Content-Type')).toBe('application/json');

      const body = await response!.json();
      expect(body).toEqual({
        error: 'Service Unavailable',
        message: 'Route resolution service temporarily unavailable',
      });
    });
  });

  describe('No-match response', () => {
    it('should return null for no-match', () => {
      const resolution: PublicRouteResolution = {
        type: 'no-match',
      };

      const response = responseForPublicRouteResolution('/test', resolution);

      expect(response).toBeNull();
    });
  });

  describe('Response headers', () => {
    it('should set correct Content-Type for JSON responses', async () => {
      const conflictResolution: PublicRouteResolution = {
        type: 'conflict',
        conflictingExtensions: [],
        error: new Error('Test'),
      };

      const response = responseForPublicRouteResolution('/test', conflictResolution);
      expect(response?.headers.get('Content-Type')).toBe('application/json');
    });
  });
});
