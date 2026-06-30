import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthProviderSummaries, getPublicInvitationByToken } from '@/db/auth';

const INVITE_ACCOUNT_COOKIE = 'devholm-auth-invite';

interface RouteContext {
  params: Promise<{ token: string; provider: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token, provider } = await context.params;
    const invitation = await getPublicInvitationByToken(token);

    if (!invitation || invitation.status !== 'pending') {
      return NextResponse.redirect(new URL(`/invite/${token}?error=invalid`, request.url));
    }

    const providers = await getAuthProviderSummaries();
    const selectedProvider = providers.find((entry) => entry.provider === provider);
    if (
      !selectedProvider ||
      !selectedProvider.enabled ||
      !selectedProvider.clientIdConfigured ||
      !selectedProvider.clientSecretConfigured
    ) {
      return NextResponse.redirect(new URL(`/invite/${token}?error=provider`, request.url));
    }

    const cookieStore = await cookies();
    cookieStore.set(
      INVITE_ACCOUNT_COOKIE,
      encodeURIComponent(JSON.stringify({ token, provider })),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 900,
      }
    );

    const redirectUrl = new URL(`/api/auth/signin/${provider}`, request.url);
    redirectUrl.searchParams.set(
      'callbackUrl',
      new URL('/invite/accepted', request.url).toString()
    );

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Public invitation start error:', error);
    return NextResponse.redirect(new URL('/?invite_error=1', request.url));
  }
}
