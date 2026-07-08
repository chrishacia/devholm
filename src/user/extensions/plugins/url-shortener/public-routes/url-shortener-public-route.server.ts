import type { PublicRouteExtension } from '@core/types/extensions.server';
import { URL_SHORTENER_DEFAULT_PREFIX } from '@user/extensions/plugins/url-shortener/constants';
import { URL_SHORTENER_PLUGIN_ID } from '@user/extensions/plugins/url-shortener/constants';
import { NextResponse } from 'next/server';
import type { UrlShortenerMatchState } from '@user/extensions/plugins/url-shortener/types';
import { shortCodeSchema } from '@user/extensions/plugins/url-shortener/validation/schemas';

function splitPath(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

export const urlShortenerPublicRouteExtension: PublicRouteExtension<UrlShortenerMatchState> = {
  pluginId: URL_SHORTENER_PLUGIN_ID,
  id: 'url-shortener:redirect',
  async match(pathname) {
    const safePrefix = URL_SHORTENER_DEFAULT_PREFIX;

    const prefixSegments = splitPath(safePrefix);
    const pathSegments = splitPath(pathname);

    if (pathSegments.length !== prefixSegments.length + 1) {
      return null;
    }

    for (let i = 0; i < prefixSegments.length; i += 1) {
      if (pathSegments[i] !== prefixSegments[i]) {
        return null;
      }
    }

    const code = pathSegments[pathSegments.length - 1];
    if (!code || !shortCodeSchema.safeParse(code).success) {
      return null;
    }

    return {
      code,
      prefix: safePrefix,
    };
  },
  async handle(match, request) {
    // Keep proxy path Edge-safe: hand off redirect/data work to a Node route handler.
    const rewriteUrl = new URL(
      `/api/public/url-shortener/${encodeURIComponent(match.code)}`,
      request.url
    );
    return NextResponse.rewrite(rewriteUrl);
  },
};
