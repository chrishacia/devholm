import { describe, it, expect, vi } from 'vitest';
import {
  cleanupOldPageViews,
  scrubSensitiveReferrerParams,
  formatCompactNumber,
} from './analytics';
import { getDb } from './index';

vi.mock('./index', () => ({ getDb: vi.fn() }));

describe('cleanupOldPageViews', () => {
  it.each([
    { daysToKeep: undefined, cutoff: '2026-05-31T03:45:00.000Z' },
    { daysToKeep: 30, cutoff: '2026-10-28T03:45:00.000Z' },
  ])(
    'deletes detailed rows before $cutoff and returns the count',
    async ({ daysToKeep, cutoff }) => {
      const deleteRows = vi.fn().mockResolvedValue(12);
      const where = vi.fn().mockReturnValue({ delete: deleteRows });
      const table = vi.fn().mockReturnValue({ where });
      vi.mocked(getDb).mockReturnValueOnce(table as unknown as ReturnType<typeof getDb>);

      // Freeze and restore the clock inside each case so other tests use real time.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-27T03:45:00.000Z'));
      try {
        const count =
          daysToKeep === undefined
            ? await cleanupOldPageViews()
            : await cleanupOldPageViews(daysToKeep);
        expect(count).toBe(12);
        expect(table.mock.calls).toEqual([['analytics_page_views']]);
        expect(where).toHaveBeenCalledWith('created_at', '<', new Date(cutoff));
        expect(deleteRows).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    }
  );
});

describe('scrubSensitiveReferrerParams', () => {
  it('returns null for null or undefined', () => {
    expect(scrubSensitiveReferrerParams(null)).toBeNull();
    expect(scrubSensitiveReferrerParams(undefined)).toBeNull();
    expect(scrubSensitiveReferrerParams('')).toBeNull();
  });

  it('passes through URLs with no sensitive params', () => {
    expect(scrubSensitiveReferrerParams('https://example.com/page?ref=hn')).toBe(
      'https://example.com/page?ref=hn'
    );
  });

  it('strips token, password, and auth params', () => {
    const result = scrubSensitiveReferrerParams(
      'https://example.com/?token=abc&password=hunter2&auth=xyz&keep=ok'
    );
    expect(result).toBe('https://example.com/?keep=ok');
  });

  it('strips access_token, refresh_token, id_token, api_key', () => {
    const result = scrubSensitiveReferrerParams(
      'https://example.com/?access_token=a&refresh_token=b&id_token=c&api_key=d&page=1'
    );
    expect(result).toBe('https://example.com/?page=1');
  });

  it('is case-insensitive for param names', () => {
    const result = scrubSensitiveReferrerParams('https://example.com/?Token=abc&PASSWORD=def');
    expect(result).toBe('https://example.com/');
  });

  it('returns original string when URL is unparseable', () => {
    expect(scrubSensitiveReferrerParams('not-a-url')).toBe('not-a-url');
  });

  it('preserves the path, hash, and non-sensitive params', () => {
    const result = scrubSensitiveReferrerParams(
      'https://example.com/foo/bar?utm_source=google&token=secret#section'
    );
    expect(result).toBe('https://example.com/foo/bar?utm_source=google#section');
  });
});

describe('formatCompactNumber', () => {
  it('formats numbers under 1000 as-is', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('formats thousands with k suffix', () => {
    expect(formatCompactNumber(1000)).toBe('1k');
    expect(formatCompactNumber(1500)).toBe('1.5k');
    expect(formatCompactNumber(12_300)).toBe('12.3k');
    expect(formatCompactNumber(999_999)).toBe('1000k');
  });

  it('formats millions with M suffix', () => {
    expect(formatCompactNumber(1_000_000)).toBe('1M');
    expect(formatCompactNumber(1_500_000)).toBe('1.5M');
    expect(formatCompactNumber(12_300_000)).toBe('12.3M');
  });
});
