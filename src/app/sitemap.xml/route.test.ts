import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllTags = vi.hoisted(() => vi.fn());
const getPublishedPostEntries = vi.hoisted(() => vi.fn());
const getSeoConfig = vi.hoisted(() => vi.fn());
const getSiteInfo = vi.hoisted(() => vi.fn());
const getSitemapExtensionEntries = vi.hoisted(() => vi.fn());

vi.mock('@/db/posts', () => ({
  getAllTags,
  getPublishedPostEntries,
}));

vi.mock('@/db/settings', () => ({
  getSeoConfig,
  getSiteInfo,
}));

vi.mock('@core/lib/extensions.server', () => ({
  getSitemapExtensionEntries,
}));

import { GET } from './route';

describe('sitemap.xml route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteInfo.mockResolvedValue({ url: 'https://example.com' });
    getSeoConfig.mockResolvedValue({
      sitemap: {
        enabled: true,
        includePosts: true,
        includeTags: true,
        customPaths: ['/custom-page'],
      },
    });
    getPublishedPostEntries.mockResolvedValue([
      {
        slug: 'hello-world',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    getAllTags.mockResolvedValue([
      { id: '1', name: 'Next.js', slug: 'nextjs', description: null, postCount: 2 },
      { id: '2', name: 'Draft', slug: 'draft', description: null, postCount: 0 },
    ]);
    getSitemapExtensionEntries.mockResolvedValue([
      { url: '/extension-page', lastModified: '2026-01-03T00:00:00.000Z' },
    ]);
  });

  it('includes core, content, custom, and extension urls', async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toContain('application/xml');
    expect(body).toContain('<loc>https://example.com/blog/hello-world</loc>');
    expect(body).toContain('<loc>https://example.com/blog/tag/nextjs</loc>');
    expect(body).toContain('<loc>https://example.com/custom-page</loc>');
    expect(body).toContain('<loc>https://example.com/extension-page</loc>');
    expect(body).toContain('<lastmod>2026-01-03T00:00:00.000Z</lastmod>');
  });
});
