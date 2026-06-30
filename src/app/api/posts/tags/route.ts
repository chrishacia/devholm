import { NextResponse } from 'next/server';
import { getAllTags } from '@/db/posts';

/**
 * GET /api/posts/tags
 * Get all tags with their post counts
 */
export async function GET() {
  try {
    const tags = await getAllTags();

    // Only return tags that have at least one published post
    const activeTags = tags.filter((tag) => tag.postCount > 0);

    return NextResponse.json({ tags: activeTags });
  } catch (error) {
    console.error('Failed to fetch tags:', error);
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
  }
}
