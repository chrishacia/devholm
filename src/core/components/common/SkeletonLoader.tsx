'use client';

import { Box, Container, Skeleton, Card, CardContent, useTheme, alpha } from '@mui/material';

interface SkeletonLoaderProps {
  variant?: 'text' | 'card' | 'post' | 'list' | 'page';
  count?: number;
}

export function SkeletonLoader({ variant = 'text', count = 1 }: SkeletonLoaderProps) {
  const theme = useTheme();

  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <Card sx={{ mb: 2 }}>
            <Skeleton variant="rectangular" height={200} />
            <CardContent>
              <Skeleton variant="text" width="60%" height={32} />
              <Skeleton variant="text" width="100%" />
              <Skeleton variant="text" width="80%" />
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Skeleton variant="rounded" width={60} height={24} />
                <Skeleton variant="rounded" width={60} height={24} />
              </Box>
            </CardContent>
          </Card>
        );

      case 'post':
        return (
          <Box sx={{ mb: 3 }}>
            <Skeleton variant="text" width="80%" height={48} sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width={120} />
                <Skeleton variant="text" width={80} />
              </Box>
            </Box>
            <Skeleton variant="rectangular" height={300} sx={{ mb: 3, borderRadius: 2 }} />
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} variant="text" width="100%" />
            ))}
          </Box>
        );

      case 'list':
        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              py: 2,
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Skeleton variant="circular" width={48} height={48} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" />
            </Box>
            <Skeleton variant="rounded" width={80} height={32} />
          </Box>
        );

      case 'page':
        return (
          <Container maxWidth="lg">
            <Skeleton variant="text" width="50%" height={56} sx={{ mb: 2 }} />
            <Skeleton variant="text" width="30%" height={24} sx={{ mb: 4 }} />
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} variant="text" width="100%" sx={{ mb: 1 }} />
            ))}
            <Box sx={{ my: 4 }}>
              <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
            </Box>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} variant="text" width="100%" sx={{ mb: 1 }} />
            ))}
          </Container>
        );

      default:
        return <Skeleton variant="text" width="100%" />;
    }
  };

  return (
    <Box
      sx={{
        animation: 'pulse 1.5s ease-in-out infinite',
        '@keyframes pulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.7 },
        },
      }}
    >
      {[...Array(count)].map((_, index) => (
        <Box key={index}>{renderSkeleton()}</Box>
      ))}
    </Box>
  );
}

/**
 * Default image placeholder component
 */
interface ImagePlaceholderProps {
  width?: number | string;
  height?: number | string;
  text?: string;
}

export function ImagePlaceholder({
  width = '100%',
  height = 200,
  text = 'Image',
}: ImagePlaceholderProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: alpha(theme.palette.primary.main, 0.1),
        borderRadius: 2,
        border: `2px dashed ${alpha(theme.palette.primary.main, 0.3)}`,
      }}
    >
      <Box
        sx={{
          textAlign: 'center',
          color: theme.palette.text.secondary,
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 24 24"
          sx={{
            width: 48,
            height: 48,
            fill: 'currentColor',
            opacity: 0.5,
            mb: 1,
          }}
        >
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        </Box>
        <Box sx={{ fontSize: '0.875rem' }}>{text}</Box>
      </Box>
    </Box>
  );
}
