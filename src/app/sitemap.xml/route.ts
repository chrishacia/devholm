import { NextResponse } from 'next/server';
import { getAllTags, getPublishedPostEntries } from '@/db/posts';
import { getSeoConfig, getSiteInfo } from '@/db/settings';
import { getSitemapExtensionEntries } from '@core/lib/extensions.server';

export const dynamic = 'force-dynamic';

type SitemapEntry = {
  url: string;
  lastModified?: Date;
};

const CORE_PATHS = ['/', '/blog', '/about', '/projects', '/uses', '/now', '/contact', '/resume'];

function getSiteOrigin(siteUrl: string) {
  try {
    return new URL(siteUrl).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function toAbsoluteUrl(origin: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed, origin).toString();
  } catch {
    return null;
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const [site, seo, extensionEntries] = await Promise.all([
    getSiteInfo(),
    getSeoConfig(),
    getSitemapExtensionEntries().catch(() => []),
  ]);

  if (!seo.sitemap.enabled) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const origin = getSiteOrigin(site.url);
  const entries: SitemapEntry[] = CORE_PATHS.map((pathname) => ({
    url: `${origin}${pathname}`,
  }));

  if (seo.sitemap.includePosts) {
    const posts = await getPublishedPostEntries();
    entries.push(
      ...posts.map((post) => ({
        url: `${origin}/blog/${post.slug}`,
        lastModified: post.updatedAt ?? post.publishedAt ?? undefined,
      }))
    );
  }

  if (seo.sitemap.includeTags) {
    const tags = await getAllTags();
    entries.push(
      ...tags
        .filter((tag) => tag.postCount > 0)
        .map((tag) => ({ url: `${origin}/blog/tag/${tag.slug}` }))
    );
  }

  for (const customPath of seo.sitemap.customPaths) {
    const url = toAbsoluteUrl(origin, customPath.startsWith('/') ? customPath : customPath);
    if (url) {
      entries.push({ url });
    }
  }

  for (const entry of extensionEntries) {
    const url = toAbsoluteUrl(origin, entry.url);
    if (url) {
      entries.push({
        url,
        lastModified: entry.lastModified ? new Date(entry.lastModified) : undefined,
      });
    }
  }

  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.url, entry])).values());

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniqueEntries
  .map((entry) => {
    const lastModified = entry.lastModified
      ? `\n    <lastmod>${entry.lastModified.toISOString()}</lastmod>`
      : '';

    return `  <url>\n    <loc>${escapeXml(entry.url)}</loc>${lastModified}\n  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
