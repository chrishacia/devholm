import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAuthProviderSummaries,
  getAuthSettings,
  updateAuthProviderConfig,
  updateAuthSettings,
} from '@/db/auth';
import { verifyAdmin } from '@/lib/auth-helpers';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';

const authConfigUpdateSchema = z.object({
  settings: z
    .object({
      registrationEnabled: z.boolean().optional(),
      accountLinkingEnabled: z.boolean().optional(),
      installCompleted: z.boolean().optional(),
    })
    .optional(),
  providers: z
    .array(
      z.object({
        provider: z.string().min(1),
        label: z.string().optional(),
        enabled: z.boolean(),
        clientId: z.string().min(1).optional(),
        clientSecret: z.string().min(1).optional(),
        issuer: z.string().optional().nullable(),
        scopes: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

async function enforceAdmin(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-auth-config',
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

export async function GET(request: NextRequest) {
  const authResult = await enforceAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [settings, providers] = await Promise.all([
      getAuthSettings(),
      getAuthProviderSummaries(),
    ]);

    return NextResponse.json(
      { data: { settings, providers } },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Admin auth config GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load auth configuration' },
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
    const parsed = authConfigUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid auth configuration', details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(authResult.rateLimit) }
      );
    }

    const { settings, providers } = parsed.data;

    if (settings) {
      await updateAuthSettings(settings);
    }

    if (providers) {
      for (const provider of providers) {
        await updateAuthProviderConfig(provider);
      }
    }

    const [updatedSettings, updatedProviders] = await Promise.all([
      getAuthSettings(),
      getAuthProviderSummaries(),
    ]);

    return NextResponse.json(
      {
        message: 'Auth configuration updated',
        data: { settings: updatedSettings, providers: updatedProviders },
      },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Admin auth config PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update auth configuration' },
      { status: 500, headers: rateLimitHeaders(authResult.rateLimit) }
    );
  }
}
