import { NextRequest, NextResponse } from 'next/server';
import { getPostsByTag } from '@/db/posts';

/**
 * GET /api/posts/tag/[slug]
 * Get published blog posts filtered by tag
 *
 * Query params:
 * - page: Page number (default: 1)
 * - pageSize: Posts per page (default: 10, max: 50)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const requestedPageSize = parseInt(searchParams.get('pageSize') || '10', 10);
    const pageSize = Math.min(50, Math.max(1, requestedPageSize));

    const result = await getPostsByTag(slug, page, pageSize);

    if (!result) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch posts by tag:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}
