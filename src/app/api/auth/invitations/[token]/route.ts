import { NextRequest, NextResponse } from 'next/server';
import { getAuthProviderSummaries, getPublicInvitationByToken } from '@/db/auth';

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const invitation = await getPublicInvitationByToken(token);

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    const providers = await getAuthProviderSummaries();

    return NextResponse.json({
      data: {
        invitation,
        providers: providers.filter(
          (provider) =>
            provider.enabled && provider.clientIdConfigured && provider.clientSecretConfigured
        ),
      },
    });
  } catch (error) {
    console.error('Public invitation GET error:', error);
    return NextResponse.json({ error: 'Failed to load invitation' }, { status: 500 });
  }
}
