import { describe, it, expect } from 'vitest';
import { scrubSensitiveReferrerParams, formatCompactNumber } from './analytics';

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
