import { getReservedRoutes } from '@core/lib/reserved-routes.server';
import {
  URL_SHORTENER_DEFAULT_PREFIX,
  URL_SHORTENER_ROUTE_PREFIX_KEY,
} from '@user/extensions/plugins/url-shortener/constants';
import { routePrefixSchema } from '@user/extensions/plugins/url-shortener/validation/schemas';

const RESERVED_PREFIXES = new Set([
  '/',
  '/api',
  '/admin',
  '/static',
  '/_next',
  '/uploads',
  '/.well-known',
]);

function normalizePrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withoutQuery = trimmed.split('?')[0].split('#')[0];
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const normalized = withLeadingSlash.replace(/\/+$/u, '');
  return normalized || '/';
}

export interface PrefixValidationOptions {
  additionalDisallowedPrefixes?: readonly string[];
}

export function validateRoutePrefix(input: string, options: PrefixValidationOptions = {}): string {
  const raw = input.trim();
  if (raw.includes('?') || raw.includes('#')) {
    throw new Error('Prefix cannot contain query strings or fragments');
  }

  const normalized = normalizePrefix(input);

  if (!normalized) {
    throw new Error('Prefix cannot be empty');
  }

  if (normalized === '/') {
    throw new Error('Prefix cannot be root /');
  }

  routePrefixSchema.parse(normalized);

  if (RESERVED_PREFIXES.has(normalized)) {
    throw new Error(`Prefix ${normalized} is reserved`);
  }

  const reservedRoutes = getReservedRoutes();
  if (reservedRoutes.has(normalized)) {
    throw new Error(`Prefix ${normalized} collides with a reserved route`);
  }

  for (const disallowed of options.additionalDisallowedPrefixes ?? []) {
    if (normalizePrefix(disallowed) === normalized) {
      throw new Error(`Prefix ${normalized} collides with an existing registered extension`);
    }
  }

  return normalized;
}

export async function resolveConfiguredPrefix(
  getSetting: (key: string) => Promise<unknown>
): Promise<string> {
  const value = await getSetting(URL_SHORTENER_ROUTE_PREFIX_KEY);
  const input = typeof value === 'string' && value.trim() ? value : URL_SHORTENER_DEFAULT_PREFIX;

  return validateRoutePrefix(input);
}
