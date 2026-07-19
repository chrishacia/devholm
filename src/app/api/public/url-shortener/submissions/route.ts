import { NextRequest, NextResponse } from 'next/server';
import { isPluginEnabledForRequest } from '@/db/plugins-enabled';
import { URL_SHORTENER_PLUGIN_ID } from '@user/extensions/plugins/url-shortener/constants';
import {
  createUrlShortenerPublicSubmission,
  getUrlShortenerSettings,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';

function disabledPluginResponse() {
  return NextResponse.json(
    {
      error: 'URL Shortener plugin is disabled',
      code: 'PLUGIN_DISABLED',
      message: 'Public submission is unavailable until the plugin is re-enabled.',
    },
    { status: 404 }
  );
}

export async function POST(request: NextRequest) {
  if (!(await isPluginEnabledForRequest(URL_SHORTENER_PLUGIN_ID).catch(() => false))) {
    return disabledPluginResponse();
  }

  const settings = await getUrlShortenerSettings();
  if (settings.publicCreationMode === 'admin-only') {
    return NextResponse.json(
      {
        error: 'Public submission is disabled by plugin settings',
        code: 'PUBLIC_SUBMISSIONS_DISABLED',
      },
      { status: 403 }
    );
  }

  if (settings.publicCreationMode === 'authenticated') {
    return NextResponse.json(
      {
        error: 'Authentication is required for public submissions',
        code: 'AUTH_REQUIRED',
      },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const destinationUrl = typeof body.destinationUrl === 'string' ? body.destinationUrl : '';

  if (!destinationUrl) {
    return NextResponse.json(
      {
        error: 'Invalid public submission payload',
        details: { destinationUrl: ['Destination URL is required'] },
      },
      { status: 400 }
    );
  }

  const submission = await createUrlShortenerPublicSubmission({
    destinationUrl,
    requestedCode: typeof body.requestedCode === 'string' ? body.requestedCode : undefined,
    requesterType: 'public',
    requesterId: null,
    requesterLabel: typeof body.requesterLabel === 'string' ? body.requesterLabel : null,
  });

  return NextResponse.json({ submission }, { status: 201 });
}
