import type { Metadata } from 'next';
import type { AdminPageExtension } from '@core/types/extensions.server';
import { Alert, Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { URL_SHORTENER_PLUGIN_ID } from '@user/extensions/plugins/url-shortener/constants';

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            {title}
          </Typography>
          <Typography color="text.secondary">{description}</Typography>
        </Box>

        <Alert severity="info">This area is intentionally minimal in Phase 2.</Alert>

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                Foundation only
              </Typography>
              <Typography color="text.secondary">
                The lifecycle, routing, and settings surfaces exist, but the operational workflows
                are deferred until later phases.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
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
