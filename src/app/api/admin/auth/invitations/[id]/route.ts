import { NextRequest, NextResponse } from 'next/server';
import { revokeAuthInvitation } from '@/db/auth';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyPermission } from '@/lib/auth-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const token = await verifyPermission(request, 'users.manage');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-auth-invitations-delete',
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
    const { id } = await context.params;
    const invitation = await revokeAuthInvitation(id);
    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found or already redeemed' },
        { status: 404, headers: rateLimitHeaders(rateLimit) }
      );
    }

    return NextResponse.json(
      { message: 'Invitation revoked', data: invitation },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Admin invitations DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revoke invitation' },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }
}
