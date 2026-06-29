import { getDb } from './index';

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentMarkdown: string;
  contentHtml: string | null;
  coverImage: string | null;
  status: 'draft' | 'published' | 'archived' | 'scheduled';
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  noindex: boolean;
  readingTime: number | null;
  views?: number;
  authorId?: string;
}

/**
 * Post data for inserting new posts (snake_case for DB)
 */
export interface PostInsert {
  slug: string;
  title: string;
  excerpt?: string | null;
  content_markdown: string;
  content_html?: string | null;
  featured_image_url?: string | null;
  status?: 'draft' | 'published' | 'archived' | 'scheduled';
  published_at?: Date | null;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  og_image_url?: string | null;
  noindex?: boolean;
  reading_time_minutes?: number | null;
  author_id?: string;
}

/**
 * Post data for updating posts (snake_case for DB)
 */
export interface PostUpdate {
  slug?: string;
  title?: string;
  excerpt?: string | null;
  content_markdown?: string;
  content_html?: string | null;
  featured_image_url?: string | null;
  status?: 'draft' | 'published' | 'archived' | 'scheduled';
  published_at?: Date | null;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  og_image_url?: string | null;
  noindex?: boolean;
  reading_time_minutes?: number | null;
  updated_at?: Date;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface PostWithTags extends Post {
  tags: Tag[];
}

export interface PaginatedPosts {
  posts: PostWithTags[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PublishedPostEntry {
  slug: string;
  publishedAt: Date | null;
  updatedAt: Date;
}

/**
 * Get all published posts with pagination
 */
export async function getPublishedPosts(page = 1, pageSize = 10): Promise<PaginatedPosts> {
  const offset = (page - 1) * pageSize;

  // Get total count
  const [{ count }] = await getDb()('posts')
    .where('status', 'published')
    .whereNotNull('published_at')
    .count('* as count');

  const total = Number(count);

  // Get posts
  const posts = await getDb()('posts')
    .select(
      'id',
      'slug',
      'title',
      'excerpt',
      'content_markdown as contentMarkdown',
      'content_html as contentHtml',
      'featured_image_url as coverImage',
      'status',
      'published_at as publishedAt',
      'created_at as createdAt',
      'updated_at as updatedAt',
      'seo_title as metaTitle',
      'seo_description as metaDescription',
      'canonical_url as canonicalUrl',
      'og_image_url as ogImageUrl',
      'noindex',
      'reading_time_minutes as readingTime'
    )
    .where('status', 'published')
    .whereNotNull('published_at')
    .orderBy('published_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  // Get tags for each post
  const postsWithTags = await Promise.all(
    posts.map(async (post: Post) => {
      const tags = await getDb()('tags')
        .select('tags.id', 'tags.name', 'tags.slug', 'tags.description')
        .join('post_tags', 'tags.id', 'post_tags.tag_id')
        .where('post_tags.post_id', post.id);

      return { ...post, tags };
    })
  );

  return {
    posts: postsWithTags,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get a single published post by slug
 */
export async function getPostBySlug(slug: string): Promise<PostWithTags | null> {
  const post = await getDb()('posts')
    .select(
      'id',
      'slug',
      'title',
      'excerpt',
      'content_markdown as contentMarkdown',
      'content_html as contentHtml',
      'featured_image_url as coverImage',
      'status',
      'published_at as publishedAt',
      'created_at as createdAt',
      'updated_at as updatedAt',
      'seo_title as metaTitle',
      'seo_description as metaDescription',
      'canonical_url as canonicalUrl',
      'og_image_url as ogImageUrl',
      'noindex',
      'reading_time_minutes as readingTime'
    )
    .where('slug', slug)
    .where('status', 'published')
    .whereNotNull('published_at')
    .first();

  if (!post) {
    return null;
  }

  const tags = await getDb()('tags')
    .select('tags.id', 'tags.name', 'tags.slug', 'tags.description')
    .join('post_tags', 'tags.id', 'post_tags.tag_id')
    .where('post_tags.post_id', post.id);

  return { ...post, tags };
}

/**
 * Get posts by tag slug
 */
export async function getPostsByTag(
  tagSlug: string,
  page = 1,
  pageSize = 10
): Promise<PaginatedPosts & { tag: Tag | null }> {
  const offset = (page - 1) * pageSize;

  // Get the tag
  const tag = await getDb()('tags')
    .select('id', 'name', 'slug', 'description')
    .where('slug', tagSlug)
    .first();

  if (!tag) {
    return {
      posts: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      tag: null,
    };
  }

  // Get total count
  const [{ count }] = await getDb()('posts')
    .join('post_tags', 'posts.id', 'post_tags.post_id')
    .where('post_tags.tag_id', tag.id)
    .where('posts.status', 'published')
    .whereNotNull('posts.published_at')
    .count('* as count');

  const total = Number(count);

  // Get posts
  const posts = await getDb()('posts')
    .select(
      'posts.id',
      'posts.slug',
      'posts.title',
      'posts.excerpt',
      'posts.content_markdown as contentMarkdown',
      'posts.content_html as contentHtml',
      'posts.featured_image_url as coverImage',
      'posts.status',
      'posts.published_at as publishedAt',
      'posts.created_at as createdAt',
      'posts.updated_at as updatedAt',
      'posts.seo_title as metaTitle',
      'posts.seo_description as metaDescription',
      'posts.canonical_url as canonicalUrl',
      'posts.og_image_url as ogImageUrl',
      'posts.noindex as noindex',
      'posts.reading_time_minutes as readingTime'
    )
    .join('post_tags', 'posts.id', 'post_tags.post_id')
    .where('post_tags.tag_id', tag.id)
    .where('posts.status', 'published')
    .whereNotNull('posts.published_at')
    .orderBy('posts.published_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  // Get tags for each post
  const postsWithTags = await Promise.all(
    posts.map(async (post: Post) => {
      const postTags = await getDb()('tags')
        .select('tags.id', 'tags.name', 'tags.slug', 'tags.description')
        .join('post_tags', 'tags.id', 'post_tags.tag_id')
        .where('post_tags.post_id', post.id);

      return { ...post, tags: postTags };
    })
  );

  return {
    posts: postsWithTags,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    tag,
  };
}

/**
 * Get all tags with post count
 */
export async function getAllTags(): Promise<(Tag & { postCount: number })[]> {
  const tags = await getDb()('tags')
    .select(
      'tags.id',
      'tags.name',
      'tags.slug',
      'tags.description',
      getDb().raw('COUNT(DISTINCT post_tags.post_id) as "postCount"')
    )
    .leftJoin('post_tags', 'tags.id', 'post_tags.tag_id')
    .leftJoin('posts', function () {
      this.on('post_tags.post_id', '=', 'posts.id')
        .andOn('posts.status', '=', getDb().raw('?', ['published']))
        .andOnNotNull('posts.published_at');
    })
    .groupBy('tags.id', 'tags.name', 'tags.slug', 'tags.description')
    .orderBy('tags.name');

  return tags.map((tag: Tag & { postCount: string }) => ({
    ...tag,
    postCount: Number(tag.postCount),
  }));
}

/**
 * Get recent posts for sidebar/homepage
 */
export async function getRecentPosts(limit = 5): Promise<PostWithTags[]> {
  const result = await getPublishedPosts(1, limit);
  return result.posts;
}

/**
 * Get all post slugs for static generation
 */
export async function getAllPostSlugs(): Promise<string[]> {
  const posts = await getDb()('posts')
    .select('slug')
    .where('status', 'published')
    .whereNotNull('published_at');

  return posts.map((post: { slug: string }) => post.slug);
}

/**
 * Get published post URLs with timestamps for metadata routes.
 */
export async function getPublishedPostEntries(): Promise<PublishedPostEntry[]> {
  return getDb()('posts')
    .select('slug', 'published_at as publishedAt', 'updated_at as updatedAt')
    .where('status', 'published')
    .whereNotNull('published_at')
    .orderBy('published_at', 'desc');
}

/**
 * Get all tag slugs for static generation
 */
export async function getAllTagSlugs(): Promise<string[]> {
  const tags = await getDb()('tags').select('slug');
  return tags.map((tag: { slug: string }) => tag.slug);
}

/**
 * Get related posts (same tags, excluding current post)
 */
export async function getRelatedPosts(
  postId: string,
  tagIds: string[],
  limit = 3
): Promise<PostWithTags[]> {
  if (tagIds.length === 0) {
    return [];
  }

  const posts = await getDb()('posts')
    .select(
      'posts.id',
      'posts.slug',
      'posts.title',
      'posts.excerpt',
      'posts.featured_image_url as coverImage',
      'posts.published_at as publishedAt',
      'posts.reading_time_minutes as readingTime'
    )
    .join('post_tags', 'posts.id', 'post_tags.post_id')
    .whereIn('post_tags.tag_id', tagIds)
    .where('posts.status', 'published')
    .whereNotNull('posts.published_at')
    .whereNot('posts.id', postId)
    .groupBy('posts.id')
    .orderByRaw('COUNT(post_tags.tag_id) DESC, posts.published_at DESC')
    .limit(limit);

  // Get tags for each post
  const postsWithTags = await Promise.all(
    posts.map(async (post: Post) => {
      const tags = await getDb()('tags')
        .select('tags.id', 'tags.name', 'tags.slug', 'tags.description')
        .join('post_tags', 'tags.id', 'post_tags.tag_id')
        .where('post_tags.post_id', post.id);

      return { ...post, tags } as PostWithTags;
    })
  );

  return postsWithTags;
}
