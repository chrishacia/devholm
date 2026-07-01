import { describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  fetchLatestTag,
  fetchLatestRelease,
  getUpdateStatus,
  normalizeVersion,
} from './update-status';

describe('update-status', () => {
  it('normalizes version strings', () => {
    expect(normalizeVersion('v2.1.0')).toBe('2.1.0');
    expect(normalizeVersion('2.0.0+f6c8b6f')).toBe('2.0.0');
    expect(normalizeVersion(' 1.0.0 ')).toBe('1.0.0');
    expect(normalizeVersion(undefined)).toBe('0.0.0');
  });

  it('compares semantic versions numerically', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
  });

  it('returns latest release metadata when GitHub API responds', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v3.4.5',
        name: 'DevHolm 3.4.5',
        html_url: 'https://github.com/devholm/devholm.com/releases/tag/v3.4.5',
        published_at: '2026-06-01T00:00:00.000Z',
      }),
    });

    const latest = await fetchLatestRelease('devholm/devholm.com', fakeFetch);

    expect(latest).toEqual({
      repo: 'devholm/devholm.com',
      tagName: 'v3.4.5',
      version: '3.4.5',
      name: 'DevHolm 3.4.5',
      url: 'https://github.com/devholm/devholm.com/releases/tag/v3.4.5',
      publishedAt: '2026-06-01T00:00:00.000Z',
    });
  });

  it('sends GitHub authorization when a template token is configured', async () => {
    vi.stubEnv('DEVHOLM_TEMPLATE_GITHUB_TOKEN', 'token-123');

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v3.4.5',
        name: 'DevHolm 3.4.5',
        html_url: 'https://github.com/chrishacia/devholm/releases/tag/v3.4.5',
        published_at: '2026-06-01T00:00:00.000Z',
      }),
    });

    await fetchLatestRelease('chrishacia/devholm', fakeFetch);

    expect(fakeFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/chrishacia/devholm/releases/latest',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    );

    vi.unstubAllEnvs();
  });

  it('falls back to the latest tag when no release exists', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'v2.4.1' }],
    });

    const latest = await fetchLatestTag('chrishacia/devholm', fakeFetch);

    expect(latest).toEqual({
      repo: 'chrishacia/devholm',
      tagName: 'v2.4.1',
      version: '2.4.1',
      name: 'v2.4.1',
      url: 'https://github.com/chrishacia/devholm/tree/v2.4.1',
      publishedAt: '',
    });
  });

  it('computes update availability from current and latest versions', async () => {
    vi.stubEnv('DEVHOLM_FRAMEWORK_VERSION', '2.0.0');
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v2.1.0',
        name: 'DevHolm 2.1.0',
        html_url: 'https://example.com/release',
        published_at: '2026-06-10T00:00:00.000Z',
      }),
    });

    const status = await getUpdateStatus('devholm/devholm.com', fakeFetch);
    expect(status.updateAvailable).toBe(true);
    expect(status.latest?.version).toBe('2.1.0');
    expect(status.current.version).toBe('2.0.0');

    vi.unstubAllEnvs();
  });

  it('returns unknown and null availability when framework version is unset', async () => {
    vi.stubEnv('DEVHOLM_FRAMEWORK_VERSION', '');

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v3.1.1',
        name: 'DevHolm 3.1.1',
        html_url: 'https://example.com/release',
        published_at: '2026-06-10T00:00:00.000Z',
      }),
    });

    const status = await getUpdateStatus('chrishacia/devholm', fakeFetch);

    expect(status.current.version).toBe('unknown');
    expect(status.updateAvailable).toBeNull();
    expect(status.warning).toContain('DEVHOLM_FRAMEWORK_VERSION');

    vi.unstubAllEnvs();
  });

  it('uses explicit framework version when configured', async () => {
    vi.stubEnv('DEVHOLM_FRAMEWORK_VERSION', '3.1.0');

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v3.1.1',
        name: 'DevHolm 3.1.1',
        html_url: 'https://example.com/release',
        published_at: '2026-06-10T00:00:00.000Z',
      }),
    });

    const status = await getUpdateStatus('chrishacia/devholm', fakeFetch);

    expect(status.current.version).toBe('3.1.0');
    expect(status.updateAvailable).toBe(true);
    expect(status.warning).toBeUndefined();

    vi.unstubAllEnvs();
  });

  it('falls back to tag metadata when releases are unavailable', async () => {
    vi.stubEnv('DEVHOLM_FRAMEWORK_VERSION', '2.0.0+abc1234');

    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: 'v2.0.1' }],
      });

    const status = await getUpdateStatus('chrishacia/devholm', fakeFetch);

    expect(status.current.version).toBe('2.0.0');
    expect(status.latest?.version).toBe('2.0.1');
    expect(status.updateAvailable).toBe(true);

    vi.unstubAllEnvs();
  });

  it('returns a clear warning when repo metadata is unavailable without a configured admin token', async () => {
    vi.stubEnv('DEVHOLM_TEMPLATE_GITHUB_TOKEN', '');
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GH_TOKEN', '');

    const fakeFetch = vi.fn().mockResolvedValue({ ok: false });

    const status = await getUpdateStatus('chrishacia/devholm', fakeFetch);

    expect(status.warning).toContain('Admin -> Updates');

    vi.unstubAllEnvs();
  });
});
