import config from '@config';
import { DEFAULT_HOME_CONTENT } from '@core/views/home/defaults';
import HomeView from '@core/views/home/HomeView';
import { WebsiteJsonLd } from '@/components/seo/JsonLd';
import { fetchSiteSettings } from '@/lib/fetchSiteSettings';
import { getPublishedPosts, getAllTags } from '@/db/posts';

export const dynamic = 'force-dynamic';

// Homepage metadata is defined in layout.tsx as the default

export default async function HomePage() {
  const [settings, postsData, tags] = await Promise.all([
    fetchSiteSettings(),
    getPublishedPosts(1, 5).catch(() => ({ posts: [], totalPages: 0, total: 0 })),
    getAllTags().catch(() => []),
  ]);

  // Sort tags by post count for sidebar
  const sortedTags = tags.sort((a, b) => b.postCount - a.postCount);
  const content = config.content?.home ?? DEFAULT_HOME_CONTENT;

  return (
    <>
      <WebsiteJsonLd settings={settings} />
      <HomeView
        settings={settings}
        initialPosts={postsData.posts}
        initialTags={sortedTags}
        content={content}
      />
    </>
  );
}
