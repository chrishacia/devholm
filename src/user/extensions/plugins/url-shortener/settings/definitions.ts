import type { PluginSettingsDefinition } from '@core/types/plugins';
import {
  URL_SHORTENER_DEFAULT_PREFIX,
  URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
  URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
  URL_SHORTENER_ROUTE_PREFIX_KEY,
} from '@user/extensions/plugins/url-shortener/constants';

export const urlShortenerSettingsDefinitions: readonly PluginSettingsDefinition[] = [
  {
    key: URL_SHORTENER_ROUTE_PREFIX_KEY,
    type: 'string',
    defaultValue: URL_SHORTENER_DEFAULT_PREFIX,
    category: 'plugins',
    description: 'Public URL prefix for short links (single segment, e.g. /s)',
  },
  {
    key: URL_SHORTENER_PUBLIC_CREATION_MODE_KEY,
    type: 'string',
    defaultValue: 'admin-only',
    category: 'plugins',
    description: 'Public creation mode: admin-only, authenticated, public-with-approval',
  },
  {
    key: URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY,
    type: 'boolean',
    defaultValue: false,
    category: 'plugins',
    description: 'Whether legacy prefix aliases are enabled during transition periods',
  },
];
