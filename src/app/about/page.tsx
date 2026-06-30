import type { Metadata } from 'next';
import config from '@config';
import { DEFAULT_ABOUT_CONTENT } from '@core/views/about/defaults';
import AboutView from '@core/views/about/AboutView';
import { PersonJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { fetchSiteSettings } from '@/lib/fetchSiteSettings';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSiteSettings();
  return buildExtendedPageMetadata(settings, {
    title: 'About',
    description:
      'Learn more about me - a developer passionate about building modern web applications with React, Next.js, TypeScript, and Node.js.',
    path: '/about',
    openGraphType: 'profile',
  });
}

export default async function AboutPage() {
  const settings = await fetchSiteSettings();
  const content = config.content?.about ?? DEFAULT_ABOUT_CONTENT;
  const siteUrl = settings.site.url;

  return (
    <>
      <SeoExtensionJsonLd path="/about" />
      <PersonJsonLd settings={settings} />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: siteUrl },
          { name: 'About', url: `${siteUrl}/about` },
        ]}
      />
      <AboutView settings={settings} content={content} />
    </>
  );
}
