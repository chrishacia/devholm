import { isPluginEnabledForRequest } from '@/db/plugins-enabled';
import { URL_SHORTENER_PLUGIN_ID } from '@user/extensions/plugins/url-shortener/constants';
import {
  getUrlShortenerLinkByCode,
  recordUrlShortenerClick,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';

function disabledPluginResponse(): Response {
  return Response.json(
    {
      error: 'URL Shortener plugin is disabled',
      code: 'PLUGIN_DISABLED',
      message: 'Short-link redirects are unavailable until the plugin is re-enabled.',
    },
    { status: 404 }
  );
}

function plainText(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

function buildRedirectTarget(destinationUrl: string, requestUrl: string): string | null {
  let target: URL;
  let source: URL;

  try {
    target = new URL(destinationUrl);
    source = new URL(requestUrl);
  } catch {
    return null;
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return null;
  }

  // Preserve incoming tracking/query parameters on redirect targets.
  for (const [key, value] of source.searchParams.entries()) {
    target.searchParams.append(key, value);
  }

  if (
    target.origin === source.origin &&
    target.pathname === source.pathname &&
    target.search === source.search
  ) {
    return null;
  }

  return target.toString();
}

export async function handleUrlShortenerRedirect(
  code: string,
  request: Request
): Promise<Response> {
  if (!(await isPluginEnabledForRequest(URL_SHORTENER_PLUGIN_ID).catch(() => false))) {
    return disabledPluginResponse();
  }

  const link = await getUrlShortenerLinkByCode(code);

  if (!link) {
    return plainText('Short link not found', 404);
  }

  if (!link.isActive) {
    return plainText('Short link is disabled', 410);
  }

  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return plainText('Short link has expired', 410);
  }

  const status = [301, 302, 307, 308].includes(link.redirectStatusCode)
    ? link.redirectStatusCode
    : 302;
  const targetUrl = buildRedirectTarget(link.destinationUrl, request.url);
  if (!targetUrl) {
    return plainText('Short link destination is invalid', 400);
  }

  await recordUrlShortenerClick(link.id, request);

  return Response.redirect(targetUrl, status);
}
