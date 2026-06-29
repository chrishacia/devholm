import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Box, Container, Typography } from '@mui/material';
import { AuthAwareMainLayout } from '@/components';
import { parseMarkdownWithEmbeds } from '@/lib/embeds';
import { getEnabledDevPageByPath, getPublishedCmsPageBySlug } from '@/db/pages';
import { devPageDefinitions } from '@user/extensions/pages';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';

type Props = {
  params: Promise<{ slug: string[] }>;
};

function toPath(slug: string[]) {
  return '/' + slug.filter(Boolean).join('/');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = toPath(slug);

  const devPage = await getEnabledDevPageByPath(path, devPageDefinitions);
  if (devPage?.definition.getMetadata) {
    return devPage.definition.getMetadata();
  }

  if (slug.length === 1) {
    const cmsPage = await getPublishedCmsPageBySlug(slug[0]);
    if (cmsPage) {
      const settings = await getSeoSiteSettings();
      return buildExtendedPageMetadata(settings, {
        title: cmsPage.title,
        description: cmsPage.excerpt || settings.site.description,
        path,
      });
    }
  }

  return {
    title: 'Page Not Found',
    description: 'The requested page could not be found.',
  };
}

export default async function CatchAllPage({ params }: Props) {
  const { slug } = await params;
  const path = toPath(slug);

  const devPage = await getEnabledDevPageByPath(path, devPageDefinitions);
  if (devPage) {
    const loaded = await devPage.definition.loadPage();
    const PageComponent =
      typeof loaded === 'function'
        ? loaded
        : typeof loaded === 'object' && loaded && 'default' in loaded
          ? loaded.default
          : null;

    if (!PageComponent) {
      notFound();
    }

    return <PageComponent />;
  }

  if (slug.length !== 1) {
    notFound();
  }

  const cmsPage = await getPublishedCmsPageBySlug(slug[0]);
  if (!cmsPage) {
    notFound();
  }

  const html = cmsPage.contentHtml || (await parseMarkdownWithEmbeds(cmsPage.contentMarkdown));

  return (
    <AuthAwareMainLayout breadcrumbs={[{ label: cmsPage.title }]}>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h2" component="h1" sx={{ mb: 1, fontWeight: 700 }}>
            {cmsPage.title}
          </Typography>
          {cmsPage.excerpt ? (
            <Typography variant="h6" color="text.secondary">
              {cmsPage.excerpt}
            </Typography>
          ) : null}
        </Box>

        <Box
          sx={{
            typography: 'body1',
            '& h1, & h2, & h3, & h4': { mt: 4, mb: 2 },
            '& p': { mb: 2, lineHeight: 1.8 },
            '& ul, & ol': { pl: 3, mb: 2 },
            '& blockquote': {
              borderLeft: (theme) => `4px solid ${theme.palette.divider}`,
              pl: 2,
              ml: 0,
              color: 'text.secondary',
            },
            '& img': {
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 2,
            },
            '& pre': {
              overflowX: 'auto',
              p: 2,
              borderRadius: 2,
              bgcolor: 'background.paper',
            },
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Container>
    </AuthAwareMainLayout>
  );
}
