import { getReservedRoutes } from '@core/lib/reserved-routes.server';
import { validateRoutePrefix } from '@user/extensions/plugins/url-shortener/validation/prefix-validation';

export class PrefixService {
  validatePrefix(prefix: string, additionalPublicRoots: readonly string[] = []): string {
    const reservedRoutes = Array.from(getReservedRoutes());
    return validateRoutePrefix(prefix, {
      additionalDisallowedPrefixes: [...reservedRoutes, ...additionalPublicRoots],
    });
  }
}
