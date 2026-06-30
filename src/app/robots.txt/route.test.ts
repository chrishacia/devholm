import { describe, expect, it, vi, beforeEach } from 'vitest';

const getSiteInfo = vi.hoisted(() => vi.fn());
const getSeoConfig = vi.hoisted(() => vi.fn());
const getRobotsExtensionRules = vi.hoisted(() => vi.fn());

vi.mock('@/db/settings', () => ({
  getSiteInfo,
  getSeoConfig,
}));

vi.mock('@core/lib/extensions.server', () => ({
  getRobotsExtensionRules,
}));

import { GET } from './route';

describe('robots.txt route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteInfo.mockResolvedValue({ url: 'https://example.com' });
    getSeoConfig.mockResolvedValue({
      robots: {
        enabled: true,
        disallowPaths: ['/private'],
        customRules: 'User-agent: AdsBot-Google\nDisallow: /ads',
      },
      sitemap: { enabled: true },
    });
    getRobotsExtensionRules.mockResolvedValue(['User-agent: TestBot', 'Disallow: /extensions']);
  });

  it('renders default, custom, and extension rules', async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Disallow: /private');
    expect(body).toContain('User-agent: AdsBot-Google');
    expect(body).toContain('User-agent: TestBot');
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml');
  });
});
