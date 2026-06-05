import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listAuthRoles, listAuthUsers, updateAuthUserAccess } from '@/db/auth';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyPermission } from '@/lib/auth-helpers';

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  roleSlugs: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
});

async function authenticate(request: NextRequest) {
  const token = await verifyPermission(request, 'users.manage');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-auth-users',
    identifier: getClientIp(request),
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  return { token, rateLimit };
}

export async function GET(request: NextRequest) {
  const authResult = await authenticate(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [users, roles] = await Promise.all([listAuthUsers(), listAuthRoles()]);

    return NextResponse.json(
      { data: { users, roles } },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Admin auth users GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load users' },
      { status: 500, headers: rateLimitHeaders(authResult.rateLimit) }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await authenticate(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid user update payload', details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(authResult.rateLimit) }
      );
    }

    const user = await updateAuthUserAccess(parsed.data);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: rateLimitHeaders(authResult.rateLimit) }
      );
    }

    return NextResponse.json(
      { message: 'User updated', data: user },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Admin auth users PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user' },
      { status: 400, headers: rateLimitHeaders(authResult.rateLimit) }
    );
  }
}
