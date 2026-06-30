import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyAdmin } from '@/lib/auth-helpers';
import {
  getGithubUpdatesConfig,
  setGithubUpdatesToken,
  toPublicGithubUpdatesConfig,
} from '@/lib/github-updates-config';
import { fetchGithubRepoInfo } from '@/lib/github-actions';

const setTokenSchema = z.object({
  token: z.string().min(20).max(300),
});

function getTemplateRepo(): string {
  return process.env.DEVHOLM_TEMPLATE_REPO || 'chrishacia/devholm';
}

function getSiteRepo(): string {
  return (process.env.DEVHOLM_SITE_REPO || process.env.GITHUB_REPOSITORY || '').trim();
}

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-updates-token-get',
    identifier: getClientIp(request),
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const config = await getGithubUpdatesConfig();
  return NextResponse.json(
    { data: toPublicGithubUpdatesConfig(config) },
    { headers: rateLimitHeaders(rateLimit) }
  );
}

export async function PATCH(request: NextRequest) {
  const adminToken = await verifyAdmin(request);
  if (!adminToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-updates-token-set',
    identifier: getClientIp(request),
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = setTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid token payload', details: parsed.error.flatten() },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const providedToken = parsed.data.token.trim();

  // Validate token can at least read template/site repo metadata.
  const templateRepo = getTemplateRepo();
  const siteRepo = getSiteRepo();
  const [templateRepoInfo, siteRepoInfo] = await Promise.all([
    fetchGithubRepoInfo(templateRepo, fetch, providedToken),
    siteRepo ? fetchGithubRepoInfo(siteRepo, fetch, providedToken) : Promise.resolve(null),
  ]);

  if (!templateRepoInfo && !siteRepoInfo) {
    return NextResponse.json(
      {
        error:
          'Token validation failed. Ensure this PAT can access the template or site repository metadata.',
      },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const saved = await setGithubUpdatesToken(providedToken);

  return NextResponse.json({ data: saved }, { headers: rateLimitHeaders(rateLimit) });
}
