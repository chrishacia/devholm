import { NextRequest } from 'next/server';
import { handleUrlShortenerRedirect } from '@user/extensions/plugins/url-shortener/public-routes/url-shortener-redirect.server';

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { code } = await params;
  return handleUrlShortenerRedirect(code, request);
}

export async function HEAD(request: NextRequest, { params }: RouteParams) {
  const { code } = await params;
  return handleUrlShortenerRedirect(code, request);
}
