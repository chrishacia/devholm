import { isPluginEnabledForRequest } from '@/db/plugins-enabled';
import { URL_SHORTENER_PLUGIN_ID } from '@user/extensions/plugins/url-shortener/constants';
import {
  getUrlShortenerLinkByCode,
  recordUrlShortenerClick,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';

function plainText(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

export async function handleUrlShortenerRedirect(
  code: string,
  request: Request
): Promise<Response> {
  if (!(await isPluginEnabledForRequest(URL_SHORTENER_PLUGIN_ID).catch(() => false))) {
    return plainText('Short link not found', 404);
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

  await recordUrlShortenerClick(link.id, request);

  const status = [301, 302, 307, 308].includes(link.redirectStatusCode)
    ? link.redirectStatusCode
    : 302;

  return Response.redirect(link.destinationUrl, status);
}
