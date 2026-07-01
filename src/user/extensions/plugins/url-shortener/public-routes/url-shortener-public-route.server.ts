import type { PublicRouteExtension } from '@core/types/extensions.server';
import { URL_SHORTENER_PLUGIN_ID } from '@user/extensions/plugins/url-shortener/constants';
import type { UrlShortenerMatchState } from '@user/extensions/plugins/url-shortener/types';
import {
  resolveConfiguredPrefix,
  validateRoutePrefix,
} from '@user/extensions/plugins/url-shortener/validation/prefix-validation';

function splitPath(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

export const urlShortenerPublicRouteExtension: PublicRouteExtension<UrlShortenerMatchState> = {
  pluginId: URL_SHORTENER_PLUGIN_ID,
  id: 'url-shortener:redirect',
  async match(pathname, _request, context) {
    const prefix = await resolveConfiguredPrefix((key) => context.settings.get(key));
    const safePrefix = validateRoutePrefix(prefix);

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
    if (!code || code.includes('/')) {
      return null;
    }

    return {
      code,
      prefix: safePrefix,
    };
  },
  async handle() {
    return new Response('URL shortener redirect handling is not implemented yet', {
      status: 501,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  },
};
