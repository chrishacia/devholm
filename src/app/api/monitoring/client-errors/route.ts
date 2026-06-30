import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';

const clientErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  source: z.string().max(500).optional(),
  stack: z.string().max(8000).optional(),
  pathname: z.string().max(500).optional(),
  kind: z.enum(['error', 'unhandledrejection']).default('error'),
  userAgent: z.string().max(1200).optional(),
  timestamp: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit({
    action: 'client-errors',
    identifier: getClientIp(request),
    maxRequests: RateLimits.PUBLIC_API.maxRequests,
    windowMs: RateLimits.PUBLIC_API.windowMs,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const parsed = clientErrorSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rateLimit) }
      );
    }

    const data = parsed.data;
    console.error('[client-error]', {
      kind: data.kind,
      message: data.message,
      source: data.source,
      pathname: data.pathname,
      userAgent: data.userAgent,
      timestamp: data.timestamp,
      stack: data.stack,
    });

    return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error('Client error monitoring endpoint failed:', error);
    return NextResponse.json(
      { error: 'Failed to record error' },
      { status: 500, headers: rateLimitHeaders(rateLimit) }
    );
  }
}
