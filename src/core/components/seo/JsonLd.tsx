/**
 * JSON-LD Structured Data Components
 * ===================================
 *
 * Provides structured data for search engines to better understand site content.
 * Supports Schema.org types: WebSite, Person, Organization, Article, BreadcrumbList
 */

import type { SiteSettings } from '@/hooks/useSiteSettings';
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildPersonJsonLd,
  buildSoftwareAppJsonLd,
  buildWebsiteJsonLd,
} from '@/lib/seo/schema';

// =============================================================================
// Types
// =============================================================================

export interface ArticleJsonLdProps {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  tags?: string[];
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

interface JsonLdScriptProps {
  data: Record<string, unknown>;
}

function JsonLdScript({ data }: JsonLdScriptProps) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

// =============================================================================
// Website Schema (for homepage)
// =============================================================================

export function WebsiteJsonLd({ settings }: { settings: SiteSettings }) {
  return <JsonLdScript data={buildWebsiteJsonLd(settings)} />;
}

// =============================================================================
// Person Schema (for about page)
// =============================================================================

export function PersonJsonLd({ settings }: { settings: SiteSettings }) {
  return <JsonLdScript data={buildPersonJsonLd(settings)} />;
}

// =============================================================================
// Article Schema (for blog posts)
// =============================================================================

export function ArticleJsonLd({
  settings,
  title,
  description,
  url,
  imageUrl,
  datePublished,
  dateModified,
  authorName,
  tags = [],
}: ArticleJsonLdProps & { settings: SiteSettings }) {
  return (
    <JsonLdScript
      data={buildArticleJsonLd({
        settings,
        title,
        description,
        url,
        imageUrl,
        datePublished,
        dateModified,
        authorName,
        tags,
      })}
    />
  );
}

// =============================================================================
// Breadcrumb Schema
// =============================================================================

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  return <JsonLdScript data={buildBreadcrumbJsonLd(items)} />;
}

// =============================================================================
// FAQ Schema (useful for documentation/help pages)
// =============================================================================

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  return <JsonLdScript data={buildFaqJsonLd(items)} />;
}

// =============================================================================
// Software Application Schema (for projects)
// =============================================================================

export interface SoftwareAppJsonLdProps {
  name: string;
  description: string;
  url: string;
  applicationCategory?: string;
  operatingSystem?: string;
  offers?: {
    price: string;
    priceCurrency: string;
  };
}

export function SoftwareAppJsonLd({
  settings,
  name,
  description,
  url,
  applicationCategory = 'WebApplication',
  operatingSystem = 'Any',
  offers,
}: SoftwareAppJsonLdProps & { settings: SiteSettings }) {
  return (
    <JsonLdScript
      data={buildSoftwareAppJsonLd({
        settings,
        name,
        description,
        url,
        applicationCategory,
        operatingSystem,
        offers,
      })}
    />
  );
}
