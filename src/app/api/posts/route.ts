import { NextRequest, NextResponse } from 'next/server';
import { getPublishedPosts } from '@/db/posts';

/**
 * GET /api/posts
 * Get published blog posts with pagination
 *
 * Query params:
 * - page: Page number (default: 1)
 * - pageSize: Posts per page (default: 10, max: 50)
 * - featured: If "true", returns only first 5 posts for homepage
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured') === 'true';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const requestedPageSize = parseInt(searchParams.get('pageSize') || '10', 10);
    const pageSize = featured ? 5 : Math.min(50, Math.max(1, requestedPageSize));

    const result = await getPublishedPosts(page, pageSize);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}
