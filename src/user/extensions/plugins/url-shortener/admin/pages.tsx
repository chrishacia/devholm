import type { Metadata } from 'next';
import type { AdminPageExtension } from '@core/types/extensions.server';
import { URL_SHORTENER_PLUGIN_ID } from '@user/extensions/plugins/url-shortener/constants';

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ padding: 24 }}>
      <h1>{title}</h1>
      <p>{description}</p>
      <p>This area is intentionally minimal in Phase 2.</p>
    </div>
  );
}

function makePage(
  href: `/admin/${string}`,
  title: string,
  description: string
): AdminPageExtension {
  return {
    pluginId: URL_SHORTENER_PLUGIN_ID,
    href,
    loadPage: async () => ({
      default: () => <PlaceholderPage title={title} description={description} />,
    }),
    getMetadata: async (): Promise<Metadata> => ({
      title,
      description,
    }),
  };
}

export const urlShortenerAdminPageExtensions: readonly AdminPageExtension[] = [
  makePage(
    '/admin/url-shortener/overview',
    'URL Shortener Overview',
    'Plugin operational summary.'
  ),
  makePage('/admin/url-shortener/links', 'URL Shortener Links', 'Manage short links (Phase 3).'),
  makePage(
    '/admin/url-shortener/analytics',
    'URL Shortener Analytics',
    'Analytics dashboards (Phase 3).'
  ),
  makePage(
    '/admin/url-shortener/public-submissions',
    'URL Shortener Public Submissions',
    'Public submission review tools (Phase 3).'
  ),
  makePage(
    '/admin/url-shortener/settings',
    'URL Shortener Settings',
    'Plugin configuration controls.'
  ),
];
