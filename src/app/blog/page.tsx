import type { Metadata } from 'next';
import BlogView from '@core/views/blog/BlogView';
import { getPublishedPosts, getAllTags } from '@/db/posts';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSiteSettings();
  return buildExtendedPageMetadata(settings, {
    title: 'Blog',
    description:
      'Read articles about web development, software engineering, technology, and developer life. Tips, tutorials, and thoughts from a full-stack developer.',
    path: '/blog',
    alternatesTypes: {
      'application/rss+xml': '/blog/rss.xml',
    },
  });
}

export default async function BlogPage() {
  const [postsData, tags] = await Promise.all([
    getPublishedPosts(1, 10).catch(() => ({ posts: [], totalPages: 0, total: 0 })),
    getAllTags().catch(() => []),
  ]);

  return (
    <>
      <SeoExtensionJsonLd path="/blog" />
      <BlogView
        initialPosts={postsData.posts}
        initialTotalPages={postsData.totalPages}
        initialTotalPosts={postsData.total}
        initialTags={tags}
      />
    </>
  );
}
