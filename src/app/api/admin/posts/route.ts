import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { verifyAdmin } from '@/lib/auth-helpers';

/**
 * GET /api/admin/posts - List all posts (admin)
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || undefined;

  const offset = (page - 1) * limit;

  try {
    const db = getDb();

    let query = db('posts')
      .select(
        'posts.id',
        'posts.title',
        'posts.slug',
        'posts.excerpt',
        'posts.status',
        'posts.published_at',
        'posts.created_at',
        'posts.updated_at',
        'posts.featured_image_url as cover_image',
        db.raw(
          '(SELECT json_agg(t.name) FROM tags t INNER JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = posts.id) as tags'
        )
      )
      .orderBy('posts.created_at', 'desc');

    if (status && status !== 'all') {
      query = query.where('posts.status', status);
    }

    if (search) {
      query = query.where(function () {
        this.whereILike('posts.title', `%${search}%`).orWhereILike('posts.excerpt', `%${search}%`);
      });
    }

    // Get total count
    const countQuery = db('posts').count('* as count');
    if (status && status !== 'all') {
      countQuery.where('status', status);
    }
    if (search) {
      countQuery.where(function () {
        this.whereILike('title', `%${search}%`).orWhereILike('excerpt', `%${search}%`);
      });
    }
    const [{ count: totalCount }] = await countQuery;
    const total = Number(totalCount);

    // Get paginated posts
    const posts = await query.limit(limit).offset(offset);

    // Transform the data
    const transformedPosts = posts.map((post: Record<string, unknown>) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      status: post.status,
      publishedAt: post.published_at,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      coverImage: post.cover_image,
      tags: post.tags || [],
    }));

    return NextResponse.json({
      posts: transformedPosts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

/**
 * POST /api/admin/posts - Create a new post
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();

    const body = await request.json();
    const {
      title,
      slug,
      excerpt,
      content,
      status,
      publishedAt,
      tags,
      coverImage,
      metaTitle,
      metaDescription,
      canonicalUrl,
      noindex,
    } = body;

    // Validate required fields
    if (!title || !slug || !content) {
      return NextResponse.json({ error: 'Title, slug, and content are required' }, { status: 400 });
    }

    // Check if slug is unique
    const existingPost = await db('posts').where('slug', slug).first();
    if (existingPost) {
      return NextResponse.json({ error: 'A post with this slug already exists' }, { status: 400 });
    }

    // Calculate reading time (rough estimate: 200 words per minute)
    const wordCount = content.split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Prepare post data (using actual DB column names)
    const postData = {
      title,
      slug,
      excerpt: excerpt || null,
      content_markdown: content,
      status: status || 'draft',
      published_at:
        status === 'published' ? new Date() : publishedAt ? new Date(publishedAt) : null,
      featured_image_url: coverImage || null,
      seo_title: metaTitle || null,
      seo_description: metaDescription || null,
      canonical_url: canonicalUrl || null,
      noindex: noindex === true,
      author_id: token.id as string,
      reading_time_minutes: readingTime,
    };

    // Insert the post
    const [postId] = await db('posts').insert(postData).returning('id');
    const newPostId = typeof postId === 'object' ? postId.id : postId;

    // Handle tags
    if (tags && Array.isArray(tags) && tags.length > 0) {
      for (const tagName of tags) {
        // Find or create tag
        let tag = await db('tags').where('name', tagName).first();
        if (!tag) {
          const [newTag] = await db('tags')
            .insert({
              name: tagName,
              slug: tagName.toLowerCase().replace(/\s+/g, '-'),
            })
            .returning('*');
          tag = newTag;
        }

        // Link tag to post
        await db('post_tags').insert({
          post_id: newPostId,
          tag_id: tag.id,
        });
      }
    }

    // Fetch the created post
    const post = await db('posts')
      .select(
        'posts.*',
        db.raw(
          '(SELECT json_agg(t.name) FROM tags t INNER JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = posts.id) as tags'
        )
      )
      .where('posts.id', newPostId)
      .first();

    return NextResponse.json(
      {
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content_markdown,
        status: post.status,
        publishedAt: post.published_at,
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        coverImage: post.featured_image_url,
        metaTitle: post.seo_title,
        metaDescription: post.seo_description,
        canonicalUrl: post.canonical_url,
        noindex: Boolean(post.noindex),
        tags: post.tags || [],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
