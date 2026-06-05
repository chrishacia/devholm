import { NextRequest, NextResponse } from 'next/server';
import { getAuthProviderSummaries, getLinkedAccountsForUser } from '@/db/auth';
import { verifyAdmin } from '@/lib/auth-helpers';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-profile-linked-accounts-get',
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
    const userId = token.sub as string;
    const [linkedAccounts, providers] = await Promise.all([
      getLinkedAccountsForUser(userId),
      getAuthProviderSummaries(),
    ]);

    const linkedProviders = new Set(linkedAccounts.map((account) => account.provider));

    return NextResponse.json(
      {
        data: {
          linkedAccounts,
          availableProviders: providers.filter(
            (provider) =>
              provider.enabled &&
              provider.clientIdConfigured &&
              provider.clientSecretConfigured &&
              !linkedProviders.has(provider.provider)
          ),
        },
      },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Linked accounts GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load linked accounts' },
      { status: 500, headers: rateLimitHeaders(rateLimit) }
    );
  }
}
