import { NextRequest, NextResponse } from 'next/server';
import { unlinkOAuthAccountForUser } from '@/db/auth';
import { verifyAdmin } from '@/lib/auth-helpers';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-profile-linked-accounts-delete',
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
    const { accountId } = await context.params;
    const linkedAccounts = await unlinkOAuthAccountForUser(token.sub as string, accountId);
    return NextResponse.json(
      { message: 'Linked account removed', data: { linkedAccounts } },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Linked accounts DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove linked account' },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }
}
