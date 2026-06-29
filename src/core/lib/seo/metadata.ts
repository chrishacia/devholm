import type { Metadata } from 'next';
import type { PostWithTags } from '@/db/posts';
import { getMetadataExtensionData } from '@core/lib/extensions.server';
import { fetchSiteSettings } from '@/lib/fetchSiteSettings';

type SiteSettings = Awaited<ReturnType<typeof fetchSiteSettings>>;

type PageMetadataInput = {
  title?: string;
  description: string;
  path?: string;
  canonicalUrl?: string;
  openGraphType?: 'website' | 'article' | 'profile';
  robots?: Metadata['robots'];
  keywords?: string[];
  alternatesTypes?: NonNullable<Metadata['alternates']>['types'];
  images?: Array<string | { url: string; width?: number; height?: number; alt?: string }>;
};

const TWITTER_CARDS = new Set(['summary', 'summary_large_image', 'player', 'app']);

function getSiteUrl(settings: SiteSettings) {
  return settings.site.url || 'http://localhost:3000';
}

function getSiteOrigin(settings: SiteSettings) {
  try {
    return new URL(getSiteUrl(settings)).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function toAbsoluteUrl(settings: SiteSettings, value: string) {
  try {
    return new URL(value, getSiteOrigin(settings)).toString();
  } catch {
    return `${getSiteOrigin(settings)}${value.startsWith('/') ? value : `/${value}`}`;
  }
}

function formatTitle(settings: SiteSettings, title?: string) {
  if (!title) {
    return settings.seo.defaultTitle;
  }

  const template = settings.seo.titleTemplate || '%s';
  return template.includes('%s')
    ? template.replace('%s', title)
    : `${title} | ${settings.site.name}`;
}

function getTwitterCard(
  settings: SiteSettings
): 'summary' | 'summary_large_image' | 'player' | 'app' {
  const candidate = settings.seo.twitterCard;
  return TWITTER_CARDS.has(candidate)
    ? (candidate as 'summary' | 'summary_large_image' | 'player' | 'app')
    : 'summary_large_image';
}

function getDefaultImage(settings: SiteSettings) {
  return settings.seo.ogImage
    ? toAbsoluteUrl(settings, settings.seo.ogImage)
    : toAbsoluteUrl(settings, '/og-image.png');
}

function normalizeImages(
  settings: SiteSettings,
  images?: PageMetadataInput['images']
): Metadata['openGraph'] extends infer _T
  ? Array<string | URL | { url: string | URL; width?: number; height?: number; alt?: string }>
  : never {
  const source = images && images.length > 0 ? images : [getDefaultImage(settings)];
  return source.map((image) => {
    if (typeof image === 'string') {
      return toAbsoluteUrl(settings, image);
    }

    return {
      ...image,
      url: toAbsoluteUrl(settings, String(image.url)),
    };
  });
}

export async function getSeoSiteSettings() {
  return fetchSiteSettings();
}

export function buildRootMetadata(settings: SiteSettings): Metadata {
  const siteUrl = getSiteUrl(settings);
  const defaultImage = getDefaultImage(settings);
  const socialHandle = settings.social.twitter
    ? settings.social.twitter.replace(/^https?:\/\/(www\.)?twitter\.com\//i, '').replace(/^@/, '')
    : null;
  const verificationOther: Record<string, string> = {};
  if (settings.seo.verification.bing) {
    verificationOther['msvalidate.01'] = settings.seo.verification.bing;
  }
  if (settings.seo.verification.yandex) {
    verificationOther.yandex = settings.seo.verification.yandex;
  }

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: settings.seo.defaultTitle,
      template: settings.seo.titleTemplate,
    },
    description: settings.site.description,
    authors: [{ name: settings.author.name }],
    creator: settings.author.name,
    publisher: settings.author.name,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: siteUrl,
      siteName: settings.site.name,
      title: settings.seo.defaultTitle,
      description: settings.site.description,
      images: [
        {
          url: defaultImage,
          width: 1200,
          height: 630,
          alt: `${settings.site.name} - ${settings.seo.defaultTitle}`,
        },
      ],
    },
    twitter: {
      card: getTwitterCard(settings),
      title: settings.seo.defaultTitle,
      description: settings.site.description,
      creator: socialHandle ? `@${socialHandle}` : undefined,
      site: socialHandle ? `@${socialHandle}` : undefined,
      images: [defaultImage],
    },
    robots: {
      index: settings.seo.robots.enabled,
      follow: settings.seo.robots.enabled,
      googleBot: {
        index: settings.seo.robots.enabled,
        follow: settings.seo.robots.enabled,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    alternates: {
      canonical: siteUrl,
      types: {
        'application/rss+xml': [
          { url: '/rss.xml', title: `${settings.site.name} RSS Feed` },
          { url: '/blog/rss.xml', title: `${settings.site.name} Blog RSS Feed` },
        ],
      },
    },
    icons: settings.site.faviconUrl
      ? {
          icon: [{ url: settings.site.faviconUrl }],
        }
      : {
          icon: [
            { url: '/icon.svg', type: 'image/svg+xml' },
            { url: '/icon', type: 'image/png', sizes: '32x32' },
          ],
          apple: '/apple-icon',
        },
    manifest: '/site.webmanifest',
    verification: {
      google: settings.seo.verification.google || undefined,
      other: Object.keys(verificationOther).length > 0 ? verificationOther : undefined,
    },
    category: 'technology',
  };
}

export function buildPageMetadata(settings: SiteSettings, input: PageMetadataInput): Metadata {
  const canonical = input.canonicalUrl ?? toAbsoluteUrl(settings, input.path || '/');
  const fullTitle = formatTitle(settings, input.title);
  const images = normalizeImages(settings, input.images);

  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    robots: input.robots,
    openGraph: {
      title: fullTitle,
      description: input.description,
      url: canonical,
      type: input.openGraphType ?? 'website',
      images,
    },
    twitter: {
      card: getTwitterCard(settings),
      title: fullTitle,
      description: input.description,
      images: images.map((image) =>
        typeof image === 'string' || image instanceof URL ? image : image.url
      ),
    },
    alternates: {
      canonical,
      types: input.alternatesTypes,
    },
  };
}

function mergeMetadata(base: Metadata, extension: Metadata): Metadata {
  return {
    ...base,
    ...extension,
    openGraph: {
      ...base.openGraph,
      ...extension.openGraph,
    },
    twitter: {
      ...base.twitter,
      ...extension.twitter,
    },
    alternates: {
      ...base.alternates,
      ...extension.alternates,
      types: {
        ...base.alternates?.types,
        ...extension.alternates?.types,
      },
    },
    robots: extension.robots ?? base.robots,
  };
}

export async function buildExtendedPageMetadata(
  settings: SiteSettings,
  input: PageMetadataInput
): Promise<Metadata> {
  const base = buildPageMetadata(settings, input);
  if (!input.path) {
    return base;
  }

  const extensions = await getMetadataExtensionData(input.path).catch(() => []);
  return extensions.reduce((acc, extension) => mergeMetadata(acc, extension), base);
}

export async function buildExtendedPostMetadata(
  settings: SiteSettings,
  post: PostWithTags
): Promise<Metadata> {
  const base = buildPostMetadata(settings, post);
  const path = `/blog/${post.slug}`;
  const extensions = await getMetadataExtensionData(path).catch(() => []);
  return extensions.reduce((acc, extension) => mergeMetadata(acc, extension), base);
}

export function buildPostMetadata(settings: SiteSettings, post: PostWithTags): Metadata {
  const title = post.metaTitle || post.title;
  const description = post.excerpt || post.metaDescription || settings.site.description;
  const canonical = post.canonicalUrl || toAbsoluteUrl(settings, `/blog/${post.slug}`);
  const publishedAt = post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined;
  const image = post.ogImageUrl || `/blog/${post.slug}/opengraph-image`;
  const fullTitle = formatTitle(settings, title);

  return {
    title,
    description,
    keywords: post.tags.map((tag) => tag.name),
    authors: [{ name: settings.author.name }],
    robots: post.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      type: 'article',
      publishedTime: publishedAt,
      authors: [settings.author.name],
      tags: post.tags.map((tag) => tag.name),
      siteName: settings.site.name,
      images: normalizeImages(settings, [
        { url: image, width: 1200, height: 630, alt: post.title },
      ]),
    },
    twitter: {
      card: getTwitterCard(settings),
      title: fullTitle,
      description,
      images: [toAbsoluteUrl(settings, image)],
    },
    alternates: {
      canonical,
    },
  };
}
