import type { Metadata } from 'next';
import BlogPostView from '@core/views/blog/post/BlogPostView';
import { getPostBySlug } from '@/db/posts';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import { buildExtendedPostMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';
import { ArticleJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug).catch(() => null);
  const settings = await getSeoSiteSettings();

  if (!post) {
    return {
      title: 'Post Not Found',
      description: 'The requested blog post could not be found.',
    };
  }

  return buildExtendedPostMetadata(settings, post);
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [post, settings] = await Promise.all([
    getPostBySlug(slug).catch(() => null),
    getSeoSiteSettings(),
  ]);

  const canonical = post?.canonicalUrl || `${settings.site.url}/blog/${slug}`;

  return (
    <>
      <SeoExtensionJsonLd path={`/blog/${slug}`} />
      {post?.publishedAt && (
        <ArticleJsonLd
          settings={settings}
          title={post.metaTitle || post.title}
          description={post.excerpt || post.metaDescription || settings.site.description}
          url={canonical}
          imageUrl={post.ogImageUrl || `/blog/${slug}/opengraph-image`}
          datePublished={new Date(post.publishedAt).toISOString()}
          dateModified={new Date(post.updatedAt).toISOString()}
          tags={post.tags.map((tag) => tag.name)}
        />
      )}
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: settings.site.url },
          { name: 'Blog', url: `${settings.site.url}/blog` },
          { name: post?.title || slug, url: canonical },
        ]}
      />
      <BlogPostView />
    </>
  );
}
