import type { Metadata } from 'next';
import AboutPageClient from './AboutPageClient';
import { siteConfig } from '@/config';
import { PersonJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { fetchSiteSettings } from '@/lib/fetchSiteSettings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn more about me - a developer passionate about building modern web applications with React, Next.js, TypeScript, and Node.js.',
  openGraph: {
    title: `About | ${siteConfig.name}`,
    description:
      'Learn more about me - a developer passionate about building modern web applications.',
    type: 'profile',
    url: `${siteConfig.url}/about`,
  },
  twitter: {
    card: 'summary_large_image',
    title: `About | ${siteConfig.name}`,
    description: 'Developer passionate about building modern web applications.',
  },
  alternates: {
    canonical: `${siteConfig.url}/about`,
  },
};

export default async function AboutPage() {
  const settings = await fetchSiteSettings();

  return (
    <>
      <PersonJsonLd />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: siteConfig.url },
          { name: 'About', url: `${siteConfig.url}/about` },
        ]}
      />
      <AboutPageClient settings={settings} />
    </>
  );
}
