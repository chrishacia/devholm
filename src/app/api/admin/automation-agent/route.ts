import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  createAgentToken,
  createAgentTokenExpiry,
  getAutomationAgentConfig,
  setAutomationAgentConfig,
  toPublicAutomationConfig,
  hashAgentToken,
} from '@/lib/automation-agent';
import { verifyAdmin } from '@/lib/auth-helpers';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  postsEnabled: z.boolean().optional(),
  messagesReadEnabled: z.boolean().optional(),
  messagesWriteEnabled: z.boolean().optional(),
  allowCustomAuthor: z.boolean().optional(),
  defaultAuthorId: z.string().uuid().nullable().optional(),
  tokenExpiresAt: z.string().datetime().nullable().optional(),
  allowedIps: z.array(z.string().min(3).max(64)).max(50).optional(),
  requireHttps: z.boolean().optional(),
  rotateToken: z.boolean().optional(),
});

async function enforceAdmin(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-automation-agent',
    identifier: clientIp,
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  return { rateLimit };
}

async function getAuthors() {
  const db = getDb();
  const rows = await db('admin_users')
    .select('id', 'display_name', 'email')
    .orderBy('created_at', 'asc');

  return rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: (row.display_name as string | null) || 'Admin User',
    email: row.email as string,
  }));
}

export async function GET(request: NextRequest) {
  const authResult = await enforceAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [config, authors] = await Promise.all([getAutomationAgentConfig(), getAuthors()]);

    return NextResponse.json(
      {
        data: {
          ...toPublicAutomationConfig(config),
          availableAuthors: authors,
        },
      },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Admin automation agent GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load automation agent configuration' },
      { status: 500, headers: rateLimitHeaders(authResult.rateLimit) }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await enforceAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid automation configuration', details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(authResult.rateLimit) }
      );
    }

    const updates = parsed.data;
    let generatedToken: string | null = null;

    if (updates.defaultAuthorId) {
      const exists = await getDb()('admin_users').where('id', updates.defaultAuthorId).first();
      if (!exists) {
        return NextResponse.json(
          { error: 'Default author not found' },
          { status: 400, headers: rateLimitHeaders(authResult.rateLimit) }
        );
      }
    }

    if (updates.rotateToken) {
      generatedToken = createAgentToken();
    }

    const nextConfig = await setAutomationAgentConfig({
      enabled: updates.enabled,
      postsEnabled: updates.postsEnabled,
      messagesReadEnabled: updates.messagesReadEnabled,
      messagesWriteEnabled: updates.messagesWriteEnabled,
      allowCustomAuthor: updates.allowCustomAuthor,
      defaultAuthorId: updates.defaultAuthorId,
      tokenExpiresAt: updates.tokenExpiresAt,
      allowedIps: updates.allowedIps,
      requireHttps: updates.requireHttps,
      ...(generatedToken
        ? {
            tokenHash: hashAgentToken(generatedToken),
            tokenHint: `${generatedToken.slice(0, 4)}...${generatedToken.slice(-4)}`,
            tokenUpdatedAt: new Date().toISOString(),
            tokenExpiresAt: createAgentTokenExpiry(30),
          }
        : {}),
    });

    const authors = await getAuthors();

    return NextResponse.json(
      {
        message: 'Automation agent configuration updated',
        data: {
          ...toPublicAutomationConfig(nextConfig),
          availableAuthors: authors,
          generatedToken,
        },
      },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Admin automation agent PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update automation agent configuration' },
      { status: 500, headers: rateLimitHeaders(authResult.rateLimit) }
    );
  }
}
