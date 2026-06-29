import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import TagArchiveClient from './TagArchiveClient';
import { getAllTags, getPostsByTag } from '@/db/posts';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';

type Props = {
  params: Promise<{ tag: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  const [settings, result] = await Promise.all([getSeoSiteSettings(), getPostsByTag(tag, 1, 10)]);

  if (!result.tag) {
    return {
      title: 'Tag Not Found',
      description: 'The requested tag could not be found.',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return buildExtendedPageMetadata(settings, {
    title: result.tag.name,
    description: result.tag.description || `Browse posts tagged with ${result.tag.name}.`,
    path: `/blog/tag/${result.tag.slug}`,
  });
}

export default async function TagPage({ params }: Props) {
  const { tag } = await params;
  const [settings, result, tags] = await Promise.all([
    getSeoSiteSettings(),
    getPostsByTag(tag, 1, 10),
    getAllTags().catch(() => []),
  ]);

  if (!result.tag) {
    notFound();
  }

  const canonical = `${settings.site.url}/blog/tag/${result.tag.slug}`;

  return (
    <>
      <SeoExtensionJsonLd path={`/blog/tag/${result.tag.slug}`} />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: settings.site.url },
          { name: 'Blog', url: `${settings.site.url}/blog` },
          { name: result.tag.name, url: canonical },
        ]}
      />
      <TagArchiveClient
        tagSlug={tag}
        initialPosts={result.posts}
        initialTag={result.tag}
        initialTotalPages={result.totalPages}
        initialTotalPosts={result.total}
        allTags={tags.filter((entry) => entry.postCount > 0)}
      />
    </>
  );
}
