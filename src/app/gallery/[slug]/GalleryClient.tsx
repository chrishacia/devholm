'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Box, Dialog, DialogContent, IconButton, Stack, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';

interface GalleryItem {
  id: string;
  kind: 'media' | 'external';
  title: string | null;
  caption: string | null;
  externalUrl: string | null;
  externalProvider: string | null;
  media?: {
    publicUrl: string | null;
    mimeType: string;
    filename: string;
    altText: string | null;
  } | null;
}

interface GalleryClientProps {
  items: GalleryItem[];
}

function renderExternal(url: string, provider: string | null) {
  if (provider === 'youtube') {
    return (
      <iframe
        src={url}
        title="YouTube"
        loading="lazy"
        allowFullScreen
        style={{ width: '100%', minHeight: 320, border: 0 }}
      />
    );
  }
  if (provider === 'tiktok') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        Open TikTok video
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      Open external media
    </a>
  );
}

export default function GalleryClient({ items }: GalleryClientProps) {
  const [selected, setSelected] = useState<GalleryItem | null>(null);

  return (
    <>
      <Box
        sx={{
          columnCount: { xs: 1, sm: 2, md: 3 },
          columnGap: 2,
          '& > *': {
            breakInside: 'avoid',
            mb: 2,
          },
        }}
      >
        {items.map((item) => {
          if (item.kind === 'media' && item.media?.publicUrl) {
            const isImage = item.media.mimeType.startsWith('image/');
            const isVideo = item.media.mimeType.startsWith('video/');

            return (
              <Box
                key={item.id}
                onClick={() => setSelected(item)}
                sx={{
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: 1,
                  borderColor: 'divider',
                  cursor: 'pointer',
                }}
              >
                {isImage ? (
                  <Image
                    src={item.media.publicUrl}
                    alt={item.media.altText || item.title || item.media.filename}
                    unoptimized
                    width={1600}
                    height={900}
                    sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw"
                    loading="lazy"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                ) : isVideo ? (
                  <video
                    src={item.media.publicUrl}
                    controls
                    style={{ width: '100%', display: 'block' }}
                  />
                ) : (
                  <Box sx={{ p: 2 }}>
                    <Typography>{item.title || item.media.filename}</Typography>
                  </Box>
                )}
              </Box>
            );
          }

          if (item.kind === 'external' && item.externalUrl) {
            return (
              <Box key={item.id} sx={{ borderRadius: 1, border: 1, borderColor: 'divider', p: 2 }}>
                {renderExternal(item.externalUrl, item.externalProvider)}
              </Box>
            );
          }

          return null;
        })}
      </Box>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="lg" fullWidth>
        <DialogContent sx={{ p: 0 }}>
          <Stack direction="row" justifyContent="flex-end" sx={{ p: 1 }}>
            <IconButton onClick={() => setSelected(null)}>
              <Close />
            </IconButton>
          </Stack>

          {selected?.kind === 'media' && selected.media?.publicUrl ? (
            selected.media.mimeType.startsWith('image/') ? (
              <Image
                src={selected.media.publicUrl}
                alt={selected.media.altText || selected.title || selected.media.filename}
                unoptimized
                width={1920}
                height={1080}
                sizes="100vw"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            ) : (
              <video
                src={selected.media.publicUrl}
                controls
                style={{ width: '100%', display: 'block' }}
              />
            )
          ) : selected?.kind === 'external' && selected.externalUrl ? (
            <Box sx={{ p: 3 }}>
              {renderExternal(selected.externalUrl, selected.externalProvider)}
            </Box>
          ) : null}

          {selected?.caption ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              {selected.caption}
            </Typography>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
