import type { Metadata } from 'next';
import UsesView from '@core/views/uses/UsesView';
import { getAllCategoriesWithItems } from '@/db/uses';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSiteSettings();
  return buildExtendedPageMetadata(settings, {
    title: 'Uses',
    description:
      'The tools, software, hardware, and gear I use for web development and everyday work. My current development setup and recommendations.',
    path: '/uses',
  });
}

export default async function UsesPage() {
  const categories = await getAllCategoriesWithItems().catch(() => []);

  return (
    <>
      <SeoExtensionJsonLd path="/uses" />
      <UsesView categories={categories} />
    </>
  );
}
