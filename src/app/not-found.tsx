import { Suspense } from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import { Home } from '@mui/icons-material';
import { AnalyticsTracker } from '@/components/analytics';

// Simple 404 page that doesn't depend on theme context
// This is required because Next.js prerenders this page statically
export default function NotFound() {
  return (
    <Container maxWidth="md">
      {/* Track 404 errors */}
      <Suspense fallback={null}>
        <AnalyticsTracker statusCode={404} />
      </Suspense>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          textAlign: 'center',
          py: 8,
        }}
      >
        {/* Stylized 404 */}
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '6rem', md: '10rem' },
            fontWeight: 800,
            lineHeight: 1,
            mb: 2,
            background: 'linear-gradient(135deg, #C4A052 0%, #6B5B95 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            opacity: 0.8,
          }}
        >
          404
        </Typography>

        <Typography variant="h4" component="h1" sx={{ mb: 2, fontWeight: 600 }}>
          Page Not Found
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you
          back on track.
        </Typography>

        <Button
          href="/"
          variant="contained"
          startIcon={<Home />}
          sx={{
            bgcolor: '#C4A052',
            '&:hover': {
              bgcolor: '#B8963C',
            },
          }}
        >
          Go Home
        </Button>
      </Box>
    </Container>
  );
}
