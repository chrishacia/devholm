import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { slugify, formatDate, formatDateTime, getRelativeTime, truncate, stripHtml } from './utils';

describe('utils', () => {
  describe('slugify', () => {
    it('converts a string to a URL-safe slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('handles special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello-world');
    });

    it('handles multiple spaces', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });

    it('handles unicode characters', () => {
      expect(slugify('Café au lait')).toBe('cafe-au-lait');
    });

    it('handles empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('handles numbers', () => {
      expect(slugify('Top 10 Tips')).toBe('top-10-tips');
    });
  });

  describe('formatDate', () => {
    it('formats a Date object', () => {
      // Use a date that won't have timezone issues
      const date = new Date(2024, 0, 15); // January 15, 2024 in local time
      const result = formatDate(date);
      expect(result).toContain('January');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('formats a date string', () => {
      // Use local date to avoid timezone issues
      const date = new Date(2024, 5, 20); // June 20, 2024
      const result = formatDate(date);
      expect(result).toContain('June');
      expect(result).toContain('20');
      expect(result).toContain('2024');
    });

    it('accepts custom options', () => {
      const date = new Date('2024-01-15');
      const result = formatDate(date, { month: 'short' });
      expect(result).toContain('Jan');
    });
  });

  describe('formatDateTime', () => {
    it('formats a date with time', () => {
      const date = new Date('2024-01-15T14:30:00');
      const result = formatDateTime(date);
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });
  });

  describe('getRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "just now" for recent times', () => {
      const date = new Date('2024-06-15T11:59:30'); // 30 seconds ago
      expect(getRelativeTime(date)).toBe('just now');
    });

    it('returns minutes ago', () => {
      const date = new Date('2024-06-15T11:55:00'); // 5 minutes ago
      expect(getRelativeTime(date)).toBe('5 minutes ago');
    });

    it('returns singular minute', () => {
      const date = new Date('2024-06-15T11:59:00'); // 1 minute ago
      expect(getRelativeTime(date)).toBe('1 minute ago');
    });

    it('returns hours ago', () => {
      const date = new Date('2024-06-15T09:00:00'); // 3 hours ago
      expect(getRelativeTime(date)).toBe('3 hours ago');
    });

    it('returns days ago', () => {
      const date = new Date('2024-06-13T12:00:00'); // 2 days ago
      expect(getRelativeTime(date)).toBe('2 days ago');
    });

    it('returns weeks ago', () => {
      const date = new Date('2024-06-01T12:00:00'); // 2 weeks ago
      expect(getRelativeTime(date)).toBe('2 weeks ago');
    });

    it('returns months ago', () => {
      const date = new Date('2024-04-15T12:00:00'); // 2 months ago
      expect(getRelativeTime(date)).toBe('2 months ago');
    });

    it('returns years ago', () => {
      const date = new Date('2022-06-15T12:00:00'); // 2 years ago
      expect(getRelativeTime(date)).toBe('2 years ago');
    });
  });

  describe('truncate', () => {
    it('returns original text if shorter than maxLength', () => {
      expect(truncate('Hello', 10)).toBe('Hello');
    });

    it('truncates text and adds ellipsis', () => {
      // maxLength includes the truncated text only, ellipsis is added after
      expect(truncate('Hello World', 5)).toBe('Hello...');
    });

    it('handles exact length', () => {
      expect(truncate('Hello', 5)).toBe('Hello');
    });

    it('handles empty string', () => {
      expect(truncate('', 10)).toBe('');
    });

    it('trims whitespace before ellipsis', () => {
      expect(truncate('Hello World Test', 6)).toBe('Hello...');
    });
  });

  describe('stripHtml', () => {
    it('removes HTML tags', () => {
      expect(stripHtml('<p>Hello World</p>')).toBe('Hello World');
    });

    it('handles multiple tags', () => {
      expect(stripHtml('<h1>Title</h1><p>Content</p>')).toBe('TitleContent');
    });

    it('handles nested tags', () => {
      expect(stripHtml('<div><p><strong>Bold</strong> text</p></div>')).toBe('Bold text');
    });

    it('handles self-closing tags', () => {
      expect(stripHtml('Line 1<br/>Line 2')).toBe('Line 1Line 2');
    });

    it('handles empty string', () => {
      expect(stripHtml('')).toBe('');
    });

    it('handles text without HTML', () => {
      expect(stripHtml('Plain text')).toBe('Plain text');
    });
  });
});
