import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllTags = vi.hoisted(() => vi.fn());
const getPostsByTag = vi.hoisted(() => vi.fn());
const getSeoSiteSettings = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/extensions.server', () => ({
  getMetadataExtensionData: vi.fn().mockResolvedValue([]),
  getStructuredDataExtensionData: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/db/posts', () => ({
  getAllTags,
  getPostsByTag,
}));

vi.mock('@/lib/seo/metadata', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo/metadata')>('@/lib/seo/metadata');
  return {
    ...actual,
    getSeoSiteSettings,
  };
});

import { generateMetadata } from './page';

describe('tag archive page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSeoSiteSettings.mockResolvedValue({
      site: {
        name: 'DevHolm',
        description: 'desc',
        url: 'https://example.com',
        logoUrl: null,
        faviconUrl: null,
      },
      author: {
        name: 'Chris',
        email: 'chris@example.com',
        bio: 'Builder',
        tagline: 'Developer',
        avatarUrl: null,
      },
      social: {
        twitter: 'devholm',
        github: 'devholm',
        linkedin: 'devholm',
        facebook: null,
        instagram: null,
        tiktok: null,
        youtube: null,
        discord: null,
      },
      seo: {
        titleTemplate: '%s | DevHolm',
        defaultTitle: 'DevHolm Default',
        ogImage: null,
        twitterCard: 'summary_large_image',
        robots: {
          enabled: true,
          disallowPaths: [],
          customRules: '',
        },
        sitemap: {
          enabled: true,
          includePosts: true,
          includeTags: false,
          customPaths: [],
        },
      },
    });
  });

  it('returns noindex metadata when tag is missing', async () => {
    getPostsByTag.mockResolvedValue({
      posts: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      tag: null,
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ tag: 'missing' }) });

    expect(metadata.title).toBe('Tag Not Found');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('returns canonical metadata for an existing tag', async () => {
    getPostsByTag.mockResolvedValue({
      posts: [],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      tag: {
        id: '1',
        name: 'Next.js',
        slug: 'nextjs',
        description: 'Posts about Next.js',
      },
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ tag: 'nextjs' }) });

    expect(metadata.alternates?.canonical).toBe('https://example.com/blog/tag/nextjs');
    expect(metadata.description).toBe('Posts about Next.js');
  });
});
