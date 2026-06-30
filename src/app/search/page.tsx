import { Suspense } from 'react';
import { Metadata } from 'next';
import SearchView from '@core/views/search/SearchView';
import { buildPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSiteSettings();
  return buildPageMetadata(settings, {
    title: 'Search',
    description: 'Search blog posts, articles, and content.',
    path: '/search',
    robots: {
      index: false,
      follow: true,
    },
  });
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchView />
    </Suspense>
  );
}
