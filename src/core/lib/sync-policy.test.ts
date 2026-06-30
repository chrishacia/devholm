import { describe, expect, it } from 'vitest';
import {
  classifyDownstreamBoundary,
  isDownstreamSafePath,
  isAllowlisted,
  parseAllowlistPatterns,
  parseNameOnlyChangedFiles,
  parsePorcelainChangedFiles,
} from './sync-policy';

describe('sync-policy', () => {
  it('identifies safe and unsafe downstream paths', () => {
    expect(isDownstreamSafePath('src/user/content/home.ts')).toBe(true);
    expect(isDownstreamSafePath('devholm.config.ts')).toBe(true);
    expect(isDownstreamSafePath('src/core/db/auth.ts')).toBe(false);
  });

  it('parses git porcelain output and keeps rename destination paths', () => {
    const output = [
      ' M src/user/content/home.ts',
      'R  src/user/content/about.ts -> src/user/content/about-me.ts',
      '?? src/user/extensions/api/telemetry/public.ts',
    ].join('\n');

    expect(parsePorcelainChangedFiles(output)).toEqual([
      'src/user/content/home.ts',
      'src/user/content/about-me.ts',
      'src/user/extensions/api/telemetry/public.ts',
    ]);
  });

  it('parses git diff --name-only output and removes duplicates', () => {
    const output = [
      'src/user/content/home.ts',
      'src/user/content/home.ts',
      'src/core/db/auth.ts',
    ].join('\n');

    expect(parseNameOnlyChangedFiles(output)).toEqual([
      'src/user/content/home.ts',
      'src/core/db/auth.ts',
    ]);
  });

  it('classifies changed files against downstream boundary policy', () => {
    const result = classifyDownstreamBoundary([
      'src/user/extensions/admin/index.tsx',
      'devholm.config.ts',
      'src/app/admin/layout.tsx',
    ]);

    expect(result.safeFiles).toEqual(['src/user/extensions/admin/index.tsx', 'devholm.config.ts']);
    expect(result.unsafeFiles).toEqual(['src/app/admin/layout.tsx']);
  });

  it('parses allowlist patterns and ignores comments', () => {
    const raw = ['# Safe drift', 'docs/**', '', 'scripts/seed-resume.js'].join('\n');
    expect(parseAllowlistPatterns(raw)).toEqual(['docs/**', 'scripts/seed-resume.js']);
  });

  it('matches allowlist patterns for exact and prefix entries', () => {
    const patterns = ['docs/**', 'scripts/seed-*'];
    expect(isAllowlisted('docs/security.md', patterns)).toBe(true);
    expect(isAllowlisted('scripts/seed-resume.js', patterns)).toBe(true);
    expect(isAllowlisted('src/core/db/auth.ts', patterns)).toBe(false);
  });

  it('treats allowlisted files as safe in boundary classification', () => {
    const result = classifyDownstreamBoundary(
      ['docs/decisions.md', 'src/core/db/auth.ts'],
      ['docs/**']
    );

    expect(result.safeFiles).toEqual(['docs/decisions.md']);
    expect(result.unsafeFiles).toEqual(['src/core/db/auth.ts']);
  });
});
