import HomePageClient from './HomePageClient';
import { WebsiteJsonLd } from '@/components/seo/JsonLd';
import { fetchSiteSettings } from '@/lib/fetchSiteSettings';
import { getPublishedPosts, getAllTags } from '@/db/posts';

export const dynamic = 'force-dynamic';

// Homepage metadata is defined in layout.tsx as the default

export default async function HomePage() {
  const [settings, postsData, tags] = await Promise.all([
    fetchSiteSettings(),
    getPublishedPosts(1, 5),
    getAllTags(),
  ]);

  // Sort tags by post count for sidebar
  const sortedTags = tags.sort((a, b) => b.postCount - a.postCount);

  return (
    <>
      <WebsiteJsonLd />
      <HomePageClient settings={settings} initialPosts={postsData.posts} initialTags={sortedTags} />
    </>
  );
}
