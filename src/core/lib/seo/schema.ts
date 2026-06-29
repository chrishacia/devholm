import type { BreadcrumbItem, FaqItem } from '@/components/seo/JsonLd';
import type { SiteSettings } from '@/hooks/useSiteSettings';

type JsonLdRecord = Record<string, unknown>;

function siteOrigin(settings: SiteSettings) {
  try {
    return new URL(settings.site.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function resolveUrl(settings: SiteSettings, value: string) {
  try {
    return new URL(value, siteOrigin(settings)).toString();
  } catch {
    return value;
  }
}

function normalizeSocialUrl(
  platform: 'twitter' | 'github' | 'linkedin' | 'instagram',
  value: string | null
) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const normalized = value.replace(/^@/, '').trim();
  if (!normalized) return null;

  switch (platform) {
    case 'twitter':
      return `https://twitter.com/${normalized}`;
    case 'github':
      return `https://github.com/${normalized}`;
    case 'linkedin':
      return `https://linkedin.com/in/${normalized}`;
    case 'instagram':
      return `https://instagram.com/${normalized}`;
  }
}

function sameAs(settings: SiteSettings) {
  return [
    normalizeSocialUrl('twitter', settings.social.twitter),
    normalizeSocialUrl('github', settings.social.github),
    normalizeSocialUrl('linkedin', settings.social.linkedin),
    normalizeSocialUrl('instagram', settings.social.instagram),
    settings.social.youtube,
    settings.social.facebook,
    settings.social.tiktok,
    settings.social.discord,
  ].filter((value): value is string => Boolean(value));
}

export function buildWebsiteJsonLd(settings: SiteSettings): JsonLdRecord {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.site.name,
    description: settings.site.description,
    url: settings.site.url,
    author: {
      '@type': 'Person',
      name: settings.author.name,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteOrigin(settings)}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    sameAs: sameAs(settings),
  };
}

export function buildPersonJsonLd(settings: SiteSettings): JsonLdRecord {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: settings.author.name,
    url: settings.site.url,
    email: settings.author.email || undefined,
    jobTitle: settings.author.tagline || undefined,
    sameAs: sameAs(settings),
    description: settings.author.bio || settings.site.description,
  };
}

export function buildArticleJsonLd(input: {
  settings: SiteSettings;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  tags?: string[];
}): JsonLdRecord {
  const {
    settings,
    title,
    description,
    url,
    imageUrl,
    datePublished,
    dateModified,
    authorName,
    tags = [],
  } = input;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    image: resolveUrl(settings, imageUrl || settings.seo.ogImage || '/og-image.png'),
    datePublished,
    dateModified: dateModified || datePublished,
    author: {
      '@type': 'Person',
      name: authorName || settings.author.name,
      url: settings.site.url,
    },
    publisher: {
      '@type': 'Person',
      name: settings.author.name,
      url: settings.site.url,
      logo: {
        '@type': 'ImageObject',
        url: resolveUrl(settings, settings.site.faviconUrl || '/icon.svg'),
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    keywords: tags.join(', '),
  };
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): JsonLdRecord {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildFaqJsonLd(items: FaqItem[]): JsonLdRecord {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function buildSoftwareAppJsonLd(input: {
  settings: SiteSettings;
  name: string;
  description: string;
  url: string;
  applicationCategory?: string;
  operatingSystem?: string;
  offers?: {
    price: string;
    priceCurrency: string;
  };
}): JsonLdRecord {
  const {
    settings,
    name,
    description,
    url,
    applicationCategory = 'WebApplication',
    operatingSystem = 'Any',
    offers,
  } = input;

  const jsonLd: JsonLdRecord = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url,
    applicationCategory,
    operatingSystem,
    author: {
      '@type': 'Person',
      name: settings.author.name,
    },
  };

  if (offers) {
    jsonLd.offers = {
      '@type': 'Offer',
      price: offers.price,
      priceCurrency: offers.priceCurrency,
    };
  }

  return jsonLd;
}
