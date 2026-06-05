import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAuthInvitation, listAuthInvitations, listAuthRoles } from '@/db/auth';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyPermission } from '@/lib/auth-helpers';

const createInvitationSchema = z.object({
  email: z.string().email(),
  roleSlugs: z.array(z.string().min(1)).min(1),
  note: z.string().max(500).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

async function authenticate(request: NextRequest) {
  const token = await verifyPermission(request, 'users.manage');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-auth-invitations',
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
    const [invitations, roles] = await Promise.all([listAuthInvitations(), listAuthRoles()]);
    return NextResponse.json(
      { data: { invitations, roles } },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Admin invitations GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load invitations' },
      { status: 500, headers: rateLimitHeaders(authResult.rateLimit) }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await authenticate(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json();
    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid invitation payload', details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(authResult.rateLimit) }
      );
    }

    const result = await createAuthInvitation({
      email: parsed.data.email,
      roleSlugs: parsed.data.roleSlugs,
      invitedBy: authResult.token.sub as string,
      note: parsed.data.note ?? null,
      expiresInHours: parsed.data.expiresInDays * 24,
    });

    return NextResponse.json(
      {
        message: 'Invitation created',
        data: {
          ...result.invitation,
          invitationLink: `${process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'}/invite/${result.rawToken}`,
        },
      },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Admin invitations POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create invitation' },
      { status: 400, headers: rateLimitHeaders(authResult.rateLimit) }
    );
  }
}
