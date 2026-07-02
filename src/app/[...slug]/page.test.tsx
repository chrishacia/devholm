import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEnabledDevPageByPath = vi.hoisted(() => vi.fn());
const getPublishedCmsPageBySlug = vi.hoisted(() => vi.fn());
const parseMarkdownWithEmbeds = vi.hoisted(() => vi.fn());
const getSeoSiteSettings = vi.hoisted(() => vi.fn());
const buildExtendedPageMetadata = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  })
);

vi.mock('@/db/pages', () => ({
  getEnabledDevPageByPath,
  getPublishedCmsPageBySlug,
}));

vi.mock('@/lib/embeds', () => ({
  parseMarkdownWithEmbeds,
}));

vi.mock('@/lib/seo/metadata', () => ({
  getSeoSiteSettings,
  buildExtendedPageMetadata,
}));

vi.mock('next/navigation', () => ({
  notFound,
}));

vi.mock('@user/extensions/pages', () => ({
  devPageDefinitions: [],
}));

import CatchAllPage from './page';

describe('catch-all page semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses notFound when CMS lookup returns null', async () => {
    getEnabledDevPageByPath.mockResolvedValue(null);
    getPublishedCmsPageBySlug.mockResolvedValue(null);

    await expect(CatchAllPage({ params: Promise.resolve({ slug: ['missing'] }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );

    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('does not swallow infrastructure error from CMS lookup', async () => {
    getEnabledDevPageByPath.mockResolvedValue(null);
    getPublishedCmsPageBySlug.mockRejectedValue(new Error('db unavailable'));

    await expect(
      CatchAllPage({ params: Promise.resolve({ slug: ['known-slug'] }) })
    ).rejects.toThrow('db unavailable');

    expect(notFound).not.toHaveBeenCalled();
  });

  it('continues to CMS lookup when dev page lookup returns null', async () => {
    getEnabledDevPageByPath.mockResolvedValue(null);
    getPublishedCmsPageBySlug.mockResolvedValue({
      title: 'CMS Page',
      excerpt: null,
      contentHtml: '<p>Hello</p>',
      contentMarkdown: 'Hello',
    });

    await CatchAllPage({ params: Promise.resolve({ slug: ['cms-page'] }) });

    expect(getPublishedCmsPageBySlug).toHaveBeenCalledWith('cms-page');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('uses notFound for multi-segment unknown paths without CMS lookup', async () => {
    getEnabledDevPageByPath.mockResolvedValue(null);

    await expect(
      CatchAllPage({ params: Promise.resolve({ slug: ['nested', 'route'] }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(getPublishedCmsPageBySlug).not.toHaveBeenCalled();
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
