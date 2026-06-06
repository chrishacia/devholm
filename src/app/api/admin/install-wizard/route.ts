import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAuthProviderSummaries,
  getAuthSettings,
  updateAuthProviderConfig,
  updateAuthSettings,
} from '@/db/auth';
import {
  getAuthorInfo,
  getSeoConfig,
  getSiteInfo,
  getSocialLinks,
  updateSettings,
} from '@/db/settings';
import { auth as authConfig } from '@/config/env';
import { verifyAdmin } from '@/lib/auth-helpers';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';

const installWizardSchema = z.object({
  site: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(300),
    url: z.string().url(),
  }),
  author: z.object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(255),
    tagline: z.string().max(160).optional().nullable(),
  }),
  auth: z.object({
    credentialsEnabled: z.boolean(),
    registrationEnabled: z.boolean(),
    accountLinkingEnabled: z.boolean(),
  }),
  providers: z.array(
    z.object({
      provider: z.string().min(1),
      enabled: z.boolean(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      issuer: z.string().nullable().optional(),
      scopes: z.array(z.string()).optional(),
    })
  ),
});

async function authenticate(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-install-wizard',
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

async function verifyWizardAccess() {
  const authSettings = await getAuthSettings();
  const wizardLocked = authSettings.installCompleted && !authConfig.setupBypassEnabled;

  if (wizardLocked) {
    return {
      authSettings,
      response: NextResponse.json(
        {
          error: 'Install wizard is locked after the initial setup has completed',
          code: 'INSTALL_WIZARD_LOCKED',
        },
        { status: 423 }
      ),
    };
  }

  return { authSettings, response: null };
}

export async function GET(request: NextRequest) {
  const authResult = await authenticate(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const access = await verifyWizardAccess();
    if (access.response) {
      return access.response;
    }

    const [site, author, social, seo, providers] = await Promise.all([
      getSiteInfo(),
      getAuthorInfo(),
      getSocialLinks(),
      getSeoConfig(),
      getAuthProviderSummaries(),
    ]);

    return NextResponse.json(
      {
        data: {
          site,
          author,
          social,
          seo,
          auth: access.authSettings,
          providers,
          recoveryOverrideEnabled: authConfig.setupBypassEnabled,
        },
      },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Install wizard GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load install wizard data' },
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
    const access = await verifyWizardAccess();
    if (access.response) {
      return access.response;
    }

    const body = await request.json();
    const parsed = installWizardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid install wizard payload', details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(authResult.rateLimit) }
      );
    }

    const { site, author, auth, providers } = parsed.data;

    await updateSettings({
      site_name: site.name,
      site_description: site.description,
      site_url: site.url,
      author_name: author.name,
      author_email: author.email,
      author_tagline: author.tagline ?? null,
      seo_default_title: site.name,
    });

    await updateAuthSettings({
      credentialsEnabled: auth.credentialsEnabled,
      registrationEnabled: auth.registrationEnabled,
      accountLinkingEnabled: auth.accountLinkingEnabled,
      installCompleted: true,
    });

    for (const provider of providers) {
      await updateAuthProviderConfig({
        provider: provider.provider,
        enabled: provider.enabled,
        ...(provider.clientId ? { clientId: provider.clientId } : {}),
        ...(provider.clientSecret ? { clientSecret: provider.clientSecret } : {}),
        ...(provider.issuer !== undefined ? { issuer: provider.issuer } : {}),
        ...(provider.scopes ? { scopes: provider.scopes } : {}),
      });
    }

    const [updatedSite, updatedAuthor, updatedAuth, updatedProviders] = await Promise.all([
      getSiteInfo(),
      getAuthorInfo(),
      getAuthSettings(),
      getAuthProviderSummaries(),
    ]);

    return NextResponse.json(
      {
        message: 'Install wizard completed',
        data: {
          site: updatedSite,
          author: updatedAuthor,
          auth: updatedAuth,
          providers: updatedProviders,
        },
      },
      { headers: rateLimitHeaders(authResult.rateLimit) }
    );
  } catch (error) {
    console.error('Install wizard POST error:', error);
    return NextResponse.json(
      { error: 'Failed to complete install wizard' },
      { status: 500, headers: rateLimitHeaders(authResult.rateLimit) }
    );
  }
}
