import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthProviderSummaries } from '@/db/auth';
import { verifyAdmin } from '@/lib/auth-helpers';

const LINK_ACCOUNT_COOKIE = 'devholm-link-account';

interface RouteContext {
  params: Promise<{ provider: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const { provider } = await context.params;
  const providers = await getAuthProviderSummaries();
  const selectedProvider = providers.find((entry) => entry.provider === provider);

  if (
    !selectedProvider ||
    !selectedProvider.enabled ||
    !selectedProvider.clientIdConfigured ||
    !selectedProvider.clientSecretConfigured
  ) {
    return NextResponse.redirect(
      new URL('/admin/profile?link_error=provider_unavailable', request.url)
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(
    LINK_ACCOUNT_COOKIE,
    encodeURIComponent(JSON.stringify({ userId: token.sub, provider })),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 300,
    }
  );

  const redirectUrl = new URL(`/api/auth/signin/${provider}`, request.url);
  redirectUrl.searchParams.set(
    'callbackUrl',
    `${new URL('/admin/profile', request.url).toString()}?linked=${provider}`
  );

  return NextResponse.redirect(redirectUrl);
}
