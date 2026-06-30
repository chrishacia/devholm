import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchPosts, getSearchSuggestions } from '@/db/search';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';

// Validation schema
const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().positive().max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  suggestions: z.enum(['true', 'false']).optional(),
});

/**
 * GET /api/search - Search posts
 * Query params:
 *   q: search query (required)
 *   limit: max results (default 10)
 *   offset: pagination offset (default 0)
 *   suggestions: if true, return suggestions only
 */
export async function GET(request: NextRequest) {
  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'search',
    identifier: clientIp,
    ...RateLimits.SEARCH,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Search rate limit exceeded. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const { searchParams } = new URL(request.url);

  // Validate query params
  const queryResult = searchQuerySchema.safeParse({
    q: searchParams.get('q') || '',
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
    suggestions: searchParams.get('suggestions'),
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: 'Invalid search parameters', details: queryResult.error.flatten() },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const { q: query, limit, offset, suggestions } = queryResult.data;
  const suggestionsOnly = suggestions === 'true';

  try {
    if (suggestionsOnly) {
      const suggestionResults = await getSearchSuggestions(query, limit);
      return NextResponse.json(
        { suggestions: suggestionResults },
        { headers: rateLimitHeaders(rateLimit) }
      );
    }

    const results = await searchPosts(query, limit, offset);
    return NextResponse.json(results, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
