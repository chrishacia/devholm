import { NextResponse } from 'next/server';
import { getSeoConfig, getSiteInfo } from '@/db/settings';
import { getRobotsExtensionRules } from '@core/lib/extensions.server';

export const dynamic = 'force-dynamic';

function normalizePath(pathname: string) {
  if (!pathname) {
    return '';
  }

  const trimmed = pathname.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function getSiteOrigin(siteUrl: string) {
  try {
    return new URL(siteUrl).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

export async function GET() {
  const [site, seo, extensionRules] = await Promise.all([
    getSiteInfo(),
    getSeoConfig(),
    getRobotsExtensionRules().catch(() => []),
  ]);
  const origin = getSiteOrigin(site.url);

  const lines = ['User-agent: *'];

  if (seo.robots.enabled) {
    lines.push('Allow: /');
    const disallowPaths = Array.from(
      new Set(['/admin', ...seo.robots.disallowPaths.map(normalizePath)].filter(Boolean))
    );

    for (const pathname of disallowPaths) {
      lines.push(`Disallow: ${pathname}`);
    }
  } else {
    lines.push('Disallow: /');
  }

  const customRules = seo.robots.customRules
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (customRules.length > 0) {
    lines.push('', ...customRules);
  }

  const normalizedExtensionRules = extensionRules.map((line) => line.trim()).filter(Boolean);
  if (normalizedExtensionRules.length > 0) {
    lines.push('', ...normalizedExtensionRules);
  }

  if (seo.sitemap.enabled) {
    lines.push('', `Sitemap: ${origin}/sitemap.xml`);
  }

  return new NextResponse(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
