import { NextRequest, NextResponse } from 'next/server';
import { getPostBySlug } from '@/db/posts';
import { parseMarkdownWithEmbeds } from '@/lib/embeds';

type RouteParams = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/posts/[slug]
 * Get a single published post by slug
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    const post = await getPostBySlug(slug);

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const renderedHtml = post.contentHtml || (await parseMarkdownWithEmbeds(post.contentMarkdown));

    return NextResponse.json({
      ...post,
      renderedHtml,
    });
  } catch (error) {
    console.error('Failed to fetch post:', error);
    return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
  }
}
