import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { sanitizeUserInput } from '@/lib/markdown';
import { slugify } from '@/lib/utils';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limiter';
import { verifyAutomationAgentToken } from '@/lib/automation-agent';
import { recordAutomationAgentEvent } from '@/lib/automation-agent-audit';

const postCreateSchema = z.object({
  title: z.string().min(3).max(300),
  slug: z.string().min(1).max(300).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.string().min(20).max(100000),
  status: z.enum(['draft', 'published']).default('draft'),
  tags: z.array(z.string().min(1).max(100)).max(20).optional(),
  coverImage: z.string().url().max(500).optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  authorId: z.string().uuid().optional(),
});

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function resolveAuthorId(
  requestedAuthorId: string | undefined,
  allowCustomAuthor: boolean,
  defaultAuthorId: string | null
): Promise<string | null> {
  const db = getDb();
  const fallback = defaultAuthorId;
  const selected = allowCustomAuthor ? requestedAuthorId || fallback : fallback;

  if (selected) {
    const found = await db('admin_users').where('id', selected).first();
    if (found) {
      return selected;
    }
    return null;
  }

  const firstAdmin = await db('admin_users').select('id').orderBy('created_at', 'asc').first();
  return (firstAdmin?.id as string | undefined) || null;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const config = await verifyAutomationAgentToken(request);
  if (!config || !config.postsEnabled) {
    await recordAutomationAgentEvent({
      route: '/api/agent/posts',
      method: 'POST',
      action: 'create-post',
      statusCode: 401,
      success: false,
      clientIp,
      details: { reason: 'unauthorized_or_disabled' },
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'agent-posts-create',
    identifier: clientIp,
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    await recordAutomationAgentEvent({
      route: '/api/agent/posts',
      method: 'POST',
      action: 'create-post',
      statusCode: 429,
      success: false,
      clientIp,
      details: { reason: 'rate_limit' },
    });
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const body = await request.json();
    const parsed = postCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rateLimit) }
      );
    }

    const data = parsed.data;
    const db = getDb();

    const cleanTitle = sanitizeUserInput(data.title).trim();
    const cleanExcerpt = data.excerpt ? sanitizeUserInput(data.excerpt).trim() : null;
    const cleanMetaTitle = data.metaTitle ? sanitizeUserInput(data.metaTitle).trim() : null;
    const cleanMetaDescription = data.metaDescription
      ? sanitizeUserInput(data.metaDescription).trim()
      : null;
    const cleanSlug = slugify(sanitizeUserInput(data.slug || cleanTitle));
    const cleanContent = sanitizeUserInput(data.content).trim();

    if (!cleanTitle || !cleanSlug || !cleanContent || cleanContent.length < 20) {
      await recordAutomationAgentEvent({
        route: '/api/agent/posts',
        method: 'POST',
        action: 'create-post',
        statusCode: 400,
        success: false,
        clientIp,
        details: { reason: 'required_fields_empty_after_sanitize' },
      });
      return badRequest('Title, slug, and content are required');
    }

    const slugExists = await db('posts').where('slug', cleanSlug).first();
    if (slugExists) {
      await recordAutomationAgentEvent({
        route: '/api/agent/posts',
        method: 'POST',
        action: 'create-post',
        statusCode: 400,
        success: false,
        clientIp,
        details: { reason: 'slug_exists', slug: cleanSlug },
      });
      return badRequest('A post with this slug already exists');
    }

    const authorId = await resolveAuthorId(
      data.authorId,
      config.allowCustomAuthor,
      config.defaultAuthorId
    );
    if (!authorId) {
      await recordAutomationAgentEvent({
        route: '/api/agent/posts',
        method: 'POST',
        action: 'create-post',
        statusCode: 400,
        success: false,
        clientIp,
        details: { reason: 'author_resolution_failed' },
      });
      return badRequest('No valid author could be resolved for this request');
    }

    const now = new Date();
    const status = data.status;
    const wordCount = cleanContent.split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    const [created] = await db('posts')
      .insert({
        title: cleanTitle,
        slug: cleanSlug,
        excerpt: cleanExcerpt,
        content_markdown: cleanContent,
        status,
        published_at: status === 'published' ? now : null,
        featured_image_url: data.coverImage || null,
        seo_title: cleanMetaTitle,
        seo_description: cleanMetaDescription,
        author_id: authorId,
        reading_time_minutes: readingTime,
      })
      .returning([
        'id',
        'title',
        'slug',
        'status',
        'published_at as publishedAt',
        'created_at as createdAt',
      ]);

    if (data.tags?.length) {
      const dedupedTags = [
        ...new Set(data.tags.map((tag) => sanitizeUserInput(tag).trim()).filter(Boolean)),
      ];

      for (const tagName of dedupedTags) {
        let tag = await db('tags').where('name', tagName).first();
        if (!tag) {
          const [newTag] = await db('tags')
            .insert({ name: tagName, slug: slugify(tagName) })
            .returning(['id', 'name']);
          tag = newTag;
        }

        await db('post_tags').insert({ post_id: created.id, tag_id: tag.id });
      }
    }

    await recordAutomationAgentEvent({
      route: '/api/agent/posts',
      method: 'POST',
      action: status === 'published' ? 'publish-post' : 'create-post',
      statusCode: 201,
      success: true,
      clientIp,
      details: { postId: created.id, status: created.status, slug: created.slug },
    });

    return NextResponse.json(
      {
        message: 'Post created',
        data: created,
      },
      { status: 201, headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Agent posts POST error:', error);
    await recordAutomationAgentEvent({
      route: '/api/agent/posts',
      method: 'POST',
      action: 'create-post',
      statusCode: 500,
      success: false,
      clientIp,
      details: { reason: 'exception' },
    });
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500, headers: rateLimitHeaders(rateLimit) }
    );
  }
}
