import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { dismissAuthOnboardingStatus, getAuthOnboardingStatus } from '@/db/auth';
import { getMessageStats } from '@/db/messages';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { AuthorizationTransportResult } from '@devholm/sdk/server';
import {
  authorizeRequest,
  adminAccessDeclaration,
  adminAccessOwner,
} from '@/lib/sdk-authorization';

/**
 * GET /api/admin/dashboard - Get dashboard stats (admin)
 *
 * Authorization: Stage 3 SDK — adminAccessDeclaration
 * (role-any[admin, superadmin] OR permission-any[admin.access])
 * Pre-migration equivalent: verifyAdmin(request) → hasAdminAccess(token)
 */
export async function GET(request: NextRequest) {
  const authResult = await authorizeRequest(request, adminAccessDeclaration, adminAccessOwner);
  if (authResult.result !== AuthorizationTransportResult.ALLOW) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: authResult.httpStatus });
  }
  const userId = authResult.subject.userId;

  const rateLimit = await checkRateLimit({
    action: 'admin-dashboard',
    identifier: getClientIp(request),
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const db = getDb();

    // Get posts stats
    const postsStats = await db('posts').select('status').count('* as count').groupBy('status');

    const postsCounts = {
      total: 0,
      published: 0,
      draft: 0,
      scheduled: 0,
      archived: 0,
    };

    for (const stat of postsStats) {
      const count = Number(stat.count);
      postsCounts.total += count;
      if (stat.status in postsCounts) {
        postsCounts[stat.status as keyof typeof postsCounts] = count;
      }
    }

    // Get message stats
    const messageStats = await getMessageStats();

    // Get recent posts (last 5)
    const recentPosts = await db('posts')
      .select('id', 'title', 'slug', 'status', 'published_at', 'created_at', 'updated_at')
      .orderBy('created_at', 'desc')
      .limit(5);

    const transformedPosts = recentPosts.map((post: Record<string, unknown>) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      status: post.status,
      publishedAt: post.published_at,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    }));

    // Get recent messages (last 5)
    const recentMessages = await db('inbox_messages')
      .select(
        'id',
        'name',
        'email',
        'subject',
        'status',
        'created_at as createdAt',
        'read_at as readAt'
      )
      .whereNot('status', 'deleted')
      .orderBy('created_at', 'desc')
      .limit(5);

    const onboarding = await getAuthOnboardingStatus(userId ?? '');

    return NextResponse.json(
      {
        stats: {
          posts: postsCounts,
          messages: messageStats,
        },
        recentPosts: transformedPosts,
        recentMessages,
        onboarding,
      },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await authorizeRequest(request, adminAccessDeclaration, adminAccessOwner);
  if (authResult.result !== AuthorizationTransportResult.ALLOW) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: authResult.httpStatus });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-dashboard-dismiss',
    identifier: getClientIp(request),
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const body = await request.json();
    if (body?.action !== 'dismiss-onboarding') {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400, headers: rateLimitHeaders(rateLimit) }
      );
    }

    await dismissAuthOnboardingStatus();
    return NextResponse.json(
      { message: 'Onboarding banner dismissed' },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Dashboard PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update dashboard state' },
      { status: 500, headers: rateLimitHeaders(rateLimit) }
    );
  }
}
