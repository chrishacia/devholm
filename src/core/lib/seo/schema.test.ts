import { describe, expect, it } from 'vitest';
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildPersonJsonLd,
  buildWebsiteJsonLd,
} from './schema';

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
};

describe('seo schema builders', () => {
  it('buildWebsiteJsonLd uses runtime settings and normalizes social urls', () => {
    const jsonLd = buildWebsiteJsonLd(settings);

    expect(jsonLd.name).toBe('DevHolm');
    expect(jsonLd.url).toBe('https://example.com');
    expect(jsonLd.sameAs).toEqual([
      'https://twitter.com/devholm',
      'https://github.com/devholm',
      'https://linkedin.com/in/devholm',
    ]);
  });

  it('buildPersonJsonLd includes tagline and bio', () => {
    const jsonLd = buildPersonJsonLd(settings);

    expect(jsonLd.jobTitle).toBe('Developer');
    expect(jsonLd.description).toBe('Builder');
  });

  it('buildArticleJsonLd includes publisher and keywords', () => {
    const jsonLd = buildArticleJsonLd({
      settings,
      title: 'Post Title',
      description: 'Post description',
      url: 'https://example.com/blog/post-title',
      datePublished: '2026-01-01T00:00:00.000Z',
      tags: ['Next.js', 'SEO'],
    });

    expect(jsonLd['@type']).toBe('Article');
    expect(jsonLd.keywords).toBe('Next.js, SEO');
    expect(jsonLd.publisher).toMatchObject({
      '@type': 'Person',
      name: 'Chris',
    });
  });

  it('buildBreadcrumbJsonLd creates list items in order', () => {
    const jsonLd = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://example.com' },
      { name: 'Blog', url: 'https://example.com/blog' },
    ]);

    expect(jsonLd.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://example.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: 'https://example.com/blog',
      },
    ]);
  });
});
