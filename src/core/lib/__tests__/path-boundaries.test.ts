/**
 * Tests for path boundary helpers
 *
 * Verify that path matching respects boundaries to prevent false positives
 * like /apiary matching /api or /admin-panel matching /admin
 */

import { describe, it, expect } from 'vitest';
import {
  isPathWithin,
  isApiPath,
  isAdminPath,
  isStaticPath,
} from '@core/lib/path-boundaries.server';

describe('Path Boundary Helpers', () => {
  describe('isPathWithin()', () => {
    it('should match exact root path', () => {
      expect(isPathWithin('/api', '/api')).toBe(true);
    });

    it('should match path with root and slash', () => {
      expect(isPathWithin('/api/test', '/api')).toBe(true);
      expect(isPathWithin('/api/test/deep', '/api')).toBe(true);
    });

    it('should not match similar-sounding path without slash', () => {
      expect(isPathWithin('/apiary', '/api')).toBe(false);
      expect(isPathWithin('/admin-panel', '/admin')).toBe(false);
      expect(isPathWithin('/static-site', '/static')).toBe(false);
    });

    it('should use the exact root, not prefix matching', () => {
      expect(isPathWithin('/api-old/v1', '/api')).toBe(false);
      expect(isPathWithin('/admin-new/page', '/admin')).toBe(false);
    });
  });

  describe('isApiPath()', () => {
    it('should identify /api paths', () => {
      expect(isApiPath('/api')).toBe(true);
      expect(isApiPath('/api/test')).toBe(true);
    });

    it('should not identify /apiary as API', () => {
      expect(isApiPath('/apiary')).toBe(false);
    });
  });

  describe('isAdminPath()', () => {
    it('should identify /admin paths', () => {
      expect(isAdminPath('/admin')).toBe(true);
      expect(isAdminPath('/admin/settings')).toBe(true);
    });

    it('should not identify /admin-panel as admin', () => {
      expect(isAdminPath('/admin-panel')).toBe(false);
    });
  });

  describe('isStaticPath()', () => {
    it('should identify /static paths', () => {
      expect(isStaticPath('/static')).toBe(true);
      expect(isStaticPath('/static/file')).toBe(true);
    });

    it('should not identify /static-site as static', () => {
      expect(isStaticPath('/static-site')).toBe(false);
    });
  });
});
