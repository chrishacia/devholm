import { getDb } from './index';

export interface SearchResult {
  id: string;
  type: 'post' | 'page';
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: Date | null;
  relevance: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}

/**
 * Search posts using PostgreSQL full-text search
 */
export async function searchPosts(query: string, limit = 10, offset = 0): Promise<SearchResponse> {
  const db = getDb();

  if (!query || query.trim().length < 2) {
    return { results: [], query, total: 0 };
  }

  // Clean and prepare the search query
  const searchTerms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length >= 2)
    .map((term) => term.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  if (searchTerms.length === 0) {
    return { results: [], query, total: 0 };
  }

  // Build the search query for PostgreSQL
  // Using ILIKE for simplicity (works without full-text search configuration)
  const likePatterns = searchTerms.map((term) => `%${term}%`);

  try {
    // Get total count
    let countQuery = db('posts').where('status', 'published').whereNotNull('published_at');

    for (const pattern of likePatterns) {
      countQuery = countQuery.where(function () {
        this.whereILike('title', pattern)
          .orWhereILike('excerpt', pattern)
          .orWhereILike('content_markdown', pattern);
      });
    }

    const [{ count }] = await countQuery.count('* as count');
    const total = Number(count);

    // Get search results
    let resultsQuery = db('posts')
      .select(
        'id',
        'title',
        'slug',
        'excerpt',
        'published_at as publishedAt',
        // Calculate a simple relevance score
        db.raw(
          `
          (
            CASE WHEN title ILIKE ? THEN 10 ELSE 0 END +
            CASE WHEN excerpt ILIKE ? THEN 5 ELSE 0 END +
            CASE WHEN content_markdown ILIKE ? THEN 1 ELSE 0 END
          ) as relevance
        `,
          [`%${searchTerms[0]}%`, `%${searchTerms[0]}%`, `%${searchTerms[0]}%`]
        )
      )
      .where('status', 'published')
      .whereNotNull('published_at');

    for (const pattern of likePatterns) {
      resultsQuery = resultsQuery.where(function () {
        this.whereILike('title', pattern)
          .orWhereILike('excerpt', pattern)
          .orWhereILike('content_markdown', pattern);
      });
    }

    const posts = await resultsQuery
      .orderBy('relevance', 'desc')
      .orderBy('published_at', 'desc')
      .limit(limit)
      .offset(offset);

    const results: SearchResult[] = posts.map((post: Record<string, unknown>) => ({
      id: post.id as string,
      type: 'post' as const,
      title: post.title as string,
      slug: post.slug as string,
      excerpt: highlightSnippet((post.excerpt as string) || '', searchTerms),
      publishedAt: post.publishedAt as Date | null,
      relevance: Number(post.relevance),
    }));

    return {
      results,
      query,
      total,
    };
  } catch (error) {
    console.error('Search error:', error);
    return { results: [], query, total: 0 };
  }
}

/**
 * Search suggestions for autocomplete
 */
export async function getSearchSuggestions(query: string, limit = 5): Promise<string[]> {
  const db = getDb();

  if (!query || query.trim().length < 2) {
    return [];
  }

  const pattern = `%${query.trim()}%`;

  try {
    // Get matching post titles
    const posts = await db('posts')
      .select('title')
      .where('status', 'published')
      .whereNotNull('published_at')
      .whereILike('title', pattern)
      .orderBy('published_at', 'desc')
      .limit(limit);

    // Get matching tags
    const tags = await db('tags').select('name').whereILike('name', pattern).limit(limit);

    const suggestions = [
      ...posts.map((p: { title: string }) => p.title),
      ...tags.map((t: { name: string }) => `Tag: ${t.name}`),
    ].slice(0, limit);

    return suggestions;
  } catch (error) {
    console.error('Search suggestions error:', error);
    return [];
  }
}

/**
 * Highlight search terms in a text snippet
 */
function highlightSnippet(text: string, terms: string[], maxLength = 200): string {
  if (!text) return '';

  let snippet = text;

  // Find the first occurrence of any search term
  let firstMatch = -1;
  let matchTerm = '';

  for (const term of terms) {
    const idx = snippet.toLowerCase().indexOf(term.toLowerCase());
    if (idx !== -1 && (firstMatch === -1 || idx < firstMatch)) {
      firstMatch = idx;
      matchTerm = term;
    }
  }

  // Extract a snippet around the first match
  if (firstMatch !== -1) {
    const start = Math.max(0, firstMatch - 50);
    const end = Math.min(snippet.length, firstMatch + matchTerm.length + 150);
    snippet =
      (start > 0 ? '...' : '') + snippet.slice(start, end) + (end < snippet.length ? '...' : '');
  } else if (snippet.length > maxLength) {
    snippet = snippet.slice(0, maxLength) + '...';
  }

  return snippet;
}

/**
 * Get popular/recent searches (for search page suggestions)
 */
export async function getPopularSearches(): Promise<string[]> {
  // For now, return popular tags as search suggestions
  const db = getDb();

  try {
    const tags = await db('tags')
      .select('tags.name')
      .join('post_tags', 'tags.id', 'post_tags.tag_id')
      .groupBy('tags.id', 'tags.name')
      .orderByRaw('COUNT(post_tags.post_id) DESC')
      .limit(10);

    return tags.map((t: { name: string }) => t.name);
  } catch (error) {
    console.error('Popular searches error:', error);
    return [];
  }
}
