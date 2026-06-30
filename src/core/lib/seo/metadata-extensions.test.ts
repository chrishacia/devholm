import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMetadataExtensionData = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/extensions.server', () => ({
  getMetadataExtensionData,
}));

import { buildExtendedPageMetadata } from './metadata';

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
      { label: 'Docs', href: '/docs' },
    ],
    footerMain: [{ label: 'Home', href: '/' }],
    footerResources: [{ label: 'Resume', href: '/resume' }],
  },
};

describe('extended page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges metadata from route extensions', async () => {
    getMetadataExtensionData.mockResolvedValue([
      {
        description: 'Extension description',
        openGraph: { title: 'Extension OG Title' },
      },
    ]);

    const metadata = await buildExtendedPageMetadata(settings, {
      title: 'Docs',
      description: 'Base description',
      path: '/docs',
    });

    expect(getMetadataExtensionData).toHaveBeenCalledWith('/docs');
    expect(metadata.description).toBe('Extension description');
    expect(metadata.openGraph).toMatchObject({ title: 'Extension OG Title' });
  });
});
