export const URL_SHORTENER_PLUGIN_ID = 'url-shortener';

export const URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT = 'url-shortener.admin-management' as const;
export const URL_SHORTENER_CAPABILITY_PUBLIC_ROUTING = 'url-shortener.public-routing' as const;

export const URL_SHORTENER_PERMISSION_ADMIN_MANAGE = 'plugin:url-shortener:admin.manage' as const;
export const URL_SHORTENER_PERMISSION_PUBLIC_REDIRECT =
  'plugin:url-shortener:public.redirect' as const;

export const URL_SHORTENER_ENABLEMENT_KEY = 'plugin:url-shortener:enabled';
export const URL_SHORTENER_ROUTE_PREFIX_KEY = 'plugin:url-shortener:route-prefix';
export const URL_SHORTENER_PUBLIC_CREATION_MODE_KEY = 'plugin:url-shortener:public-creation-mode';
export const URL_SHORTENER_LEGACY_PREFIX_ENABLED_KEY = 'plugin:url-shortener:legacy-prefix-enabled';

export const URL_SHORTENER_DEFAULT_PREFIX = '/s';

export const URL_SHORTENER_SHORT_CODE_MAX_LENGTH = 64;
export const URL_SHORTENER_SHORT_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export const URL_SHORTENER_ALLOWED_CREATION_MODES = [
  'admin-only',
  'authenticated',
  'public-with-approval',
] as const;
