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

function normalizePort(protocol: string, port: string): string {
  if (!port) {
    return '';
  }

  if ((protocol === 'http:' && port === '80') || (protocol === 'https:' && port === '443')) {
    return '';
  }

  return port;
}

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return '/';
  }

  const segments = pathname
    .split('/')
    .map((segment) => {
      if (!segment) {
        return '';
      }

      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return segment;
      }
    })
    .filter((segment, index) => segment !== '' || index === 0);

  return segments.join('/') || '/';
}

function canonicalQueryPairs(params: URLSearchParams): Array<[string, string]> {
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];

  for (const [key, value] of params.entries()) {
    const pairKey = `${key}\u0000${value}`;
    if (seen.has(pairKey)) {
      continue;
    }
    seen.add(pairKey);
    pairs.push([key, value]);
  }

  return pairs.sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey !== bKey) {
      return aKey.localeCompare(bKey);
    }
    return aValue.localeCompare(bValue);
  });
}

function appendUniqueIncomingQuery(target: URL, source: URL): void {
  const existing = new Set<string>();
  for (const [key, value] of target.searchParams.entries()) {
    existing.add(`${key}\u0000${value}`);
  }

  for (const [key, value] of source.searchParams.entries()) {
    const pairKey = `${key}\u0000${value}`;
    if (existing.has(pairKey)) {
      continue;
    }

    target.searchParams.append(key, value);
    existing.add(pairKey);
  }
}

function normalizedLoopKey(url: URL): string {
  const protocol = url.protocol.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const port = normalizePort(protocol, url.port);
  const pathname = normalizePathname(url.pathname);
  const query = canonicalQueryPairs(url.searchParams)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  const authority = port ? `${hostname}:${port}` : hostname;
  return `${protocol}//${authority}${pathname}?${query}`;
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

  // Preserve incoming query parameters only when they add new key/value information.
  appendUniqueIncomingQuery(target, source);

  if (normalizedLoopKey(target) === normalizedLoopKey(source)) {
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
