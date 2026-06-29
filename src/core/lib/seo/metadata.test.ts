import { describe, expect, it } from 'vitest';

vi.mock('@core/lib/extensions.server', () => ({
  getMetadataExtensionData: vi.fn().mockResolvedValue([]),
}));

import { buildPageMetadata, buildPostMetadata, buildRootMetadata } from './metadata';

const settings = {
  site: {
    name: 'DevHolm',
    description: 'Framework site description',
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
    verification: {
      google: null,
      bing: null,
      yandex: null,
    },
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
  navigation: {
    main: [
      { label: 'Home', href: '/' },
      { label: 'Blog', href: '/blog' },
    ],
    footerMain: [{ label: 'Home', href: '/' }],
    footerResources: [{ label: 'Resume', href: '/resume' }],
  },
};

describe('seo metadata builders', () => {
  it('buildRootMetadata uses runtime settings', () => {
    const metadata = buildRootMetadata(settings);

    expect(metadata.title).toEqual({
      default: 'DevHolm Default',
      template: '%s | DevHolm',
    });
    expect(metadata.description).toBe('Framework site description');
    expect(metadata.openGraph?.url).toBe('https://example.com');
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(metadata.verification).toEqual({
      google: undefined,
      other: undefined,
    });
  });

  it('buildPageMetadata creates canonical metadata', () => {
    const metadata = buildPageMetadata(settings, {
      title: 'Blog',
      description: 'Blog listing page',
      path: '/blog',
    });

    expect(metadata.alternates?.canonical).toBe('https://example.com/blog');
    expect(metadata.openGraph?.title).toBe('Blog | DevHolm');
    expect(metadata.twitter?.title).toBe('Blog | DevHolm');
  });

  it('buildPostMetadata honors canonical override and noindex', () => {
    const metadata = buildPostMetadata(settings, {
      id: 'post-1',
      slug: 'hello-world',
      title: 'Hello World',
      excerpt: 'Post excerpt',
      contentMarkdown: 'body',
      contentHtml: null,
      coverImage: null,
      status: 'published',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2025-12-31T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      metaTitle: 'SEO Title',
      metaDescription: 'SEO Description',
      canonicalUrl: 'https://canonical.example.com/post',
      ogImageUrl: null,
      noindex: true,
      readingTime: 4,
      tags: [{ id: 'tag-1', name: 'Next.js', slug: 'nextjs', description: null }],
    });

    expect(metadata.alternates?.canonical).toBe('https://canonical.example.com/post');
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph?.url).toBe('https://canonical.example.com/post');
  });
});
