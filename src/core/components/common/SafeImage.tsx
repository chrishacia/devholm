'use client';

import { useState, useCallback } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import { BrokenImage } from '@mui/icons-material';

interface SafeImageProps {
  src: string | null | undefined;
  alt: string;
  width?: number | string;
  height?: number | string;
  sx?: SxProps<Theme>;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  fallbackText?: string;
  showPlaceholder?: boolean;
}

/**
 * SafeImage Component
 * ===================
 *
 * A wrapper around img that gracefully handles:
 * - Missing/broken images (shows placeholder)
 * - Null/undefined src values
 * - Network errors
 *
 * Usage:
 * <SafeImage src={post.coverImage} alt={post.title} />
 */
export function SafeImage({
  src,
  alt,
  width = '100%',
  height = 'auto',
  sx,
  objectFit = 'cover',
  fallbackText = 'Image not available',
  showPlaceholder = true,
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  // If no src or error occurred, show placeholder
  if (!src || hasError) {
    if (!showPlaceholder) {
      return null;
    }

    return (
      <Box
        sx={{
          width,
          height: typeof height === 'string' && height === 'auto' ? 200 : height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
          borderRadius: 1,
          color: 'text.disabled',
          gap: 1,
          ...sx,
        }}
      >
        <BrokenImage sx={{ fontSize: 48, opacity: 0.5 }} />
        <Box component="span" sx={{ fontSize: '0.875rem', textAlign: 'center', px: 2 }}>
          {fallbackText}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      onError={handleError}
      onLoad={handleLoad}
      sx={{
        width,
        height,
        objectFit,
        opacity: isLoaded ? 1 : 0,
        transition: 'opacity 0.2s',
        ...sx,
      }}
    />
  );
}
