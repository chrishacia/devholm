import { notFound } from 'next/navigation';
import { Box, Container, Typography } from '@mui/material';
import { AuthAwareMainLayout } from '@/components';
import { getGalleryCollectionBySlug, listGalleryItems } from '@/db/gallery';
import { isPluginEnabled } from '@/db/plugins';
import GalleryClient from './GalleryClient';

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function GalleryPublicPage({ params }: Props) {
  if (!(await isPluginEnabled('gallery').catch(() => false))) {
    notFound();
  }

  const { slug } = await params;
  const gallery = await getGalleryCollectionBySlug(slug, false);

  if (!gallery) {
    notFound();
  }

  const items = await listGalleryItems(gallery.id, true);

  return (
    <AuthAwareMainLayout
      breadcrumbs={[{ label: 'Gallery', href: '/gallery' }, { label: gallery.name }]}
    >
      <Container maxWidth="xl" sx={{ py: { xs: 5, md: 8 } }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h3" component="h1" fontWeight={800}>
            {gallery.name}
          </Typography>
          {gallery.description ? (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              {gallery.description}
            </Typography>
          ) : null}
        </Box>

        <GalleryClient
          items={items.map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            caption: item.caption,
            externalUrl: item.externalUrl,
            externalProvider: item.externalProvider,
            media: item.media
              ? {
                  publicUrl: item.media.publicUrl,
                  mimeType: item.media.mimeType,
                  filename: item.media.filename,
                  altText: item.media.altText,
                }
              : null,
          }))}
        />
      </Container>
    </AuthAwareMainLayout>
  );
}
