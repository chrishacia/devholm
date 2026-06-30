import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/posts/[id] - Get a single post
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();

    const post = await db('posts')
      .select(
        'posts.*',
        db.raw(
          '(SELECT json_agg(t.name) FROM tags t INNER JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = posts.id) as tags'
        )
      )
      .where('posts.id', id)
      .first();

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/posts/[id] - Update a post
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();

    // Check if post exists
    const existingPost = await db('posts').where('id', id).first();
    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

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

    // Check if new slug is unique (if changed)
    if (slug !== existingPost.slug) {
      const slugExists = await db('posts').where('slug', slug).whereNot('id', id).first();
      if (slugExists) {
        return NextResponse.json(
          { error: 'A post with this slug already exists' },
          { status: 400 }
        );
      }
    }

    // Calculate reading time
    const wordCount = content.split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Prepare update data (using actual DB column names)
    const updateData: Record<string, unknown> = {
      title,
      slug,
      excerpt: excerpt || null,
      content_markdown: content,
      status: status || 'draft',
      featured_image_url: coverImage || null,
      seo_title: metaTitle || null,
      seo_description: metaDescription || null,
      canonical_url: canonicalUrl || null,
      noindex: noindex === true,
      updated_at: new Date(),
      reading_time_minutes: readingTime,
    };

    // Handle published_at
    if (status === 'published' && !existingPost.published_at) {
      updateData.published_at = new Date();
    } else if (status === 'scheduled' && publishedAt) {
      updateData.published_at = new Date(publishedAt);
    }

    // Update the post
    await db('posts').where('id', id).update(updateData);

    // Handle tags - remove existing and add new
    if (tags && Array.isArray(tags)) {
      // Remove existing tag associations
      await db('post_tags').where('post_id', id).delete();

      // Add new tags
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
          post_id: id,
          tag_id: tag.id,
        });
      }
    }

    // Fetch the updated post
    const post = await db('posts')
      .select(
        'posts.*',
        db.raw(
          '(SELECT json_agg(t.name) FROM tags t INNER JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = posts.id) as tags'
        )
      )
      .where('posts.id', id)
      .first();

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/posts/[id] - Delete a post
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();

    // Check if post exists
    const existingPost = await db('posts').where('id', id).first();
    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Delete tag associations first
    await db('post_tags').where('post_id', id).delete();

    // Delete the post
    await db('posts').where('id', id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
