'use client';

/**
 * About View — Core
 * =================
 *
 * Layout and structure for the /about page.
 * Content (bio, skills, interests, tagline) comes from the content prop,
 * which is populated from devholm.config.ts → content.about.
 *
 * To customize this page:
 *   Option A (content only): Edit src/user/content/about.ts
 *   Option B (full layout): pnpm devholm eject about
 */

import { Box, Typography, Container, Grid2, Avatar, Chip, Paper, alpha } from '@mui/material';
import { Person } from '@mui/icons-material';
import { AuthAwareMainLayout } from '@/components';
import type { SiteSettings } from '@/hooks/useSiteSettings';
import type { AboutContent } from '@core/types/content';

interface AboutViewProps {
  settings: SiteSettings;
  content: AboutContent;
}

export default function AboutView({ settings, content }: AboutViewProps) {
  const authorName = settings?.author?.name || 'Developer';
  const { tagline, intro, story, skills, interests } = content;

  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Hero Section */}
        <Box sx={{ textAlign: { xs: 'center', md: 'left' }, mb: { xs: 8, md: 12 } }}>
          <Grid2 container spacing={{ xs: 4, md: 5 }} alignItems="center">
            <Grid2 size={{ xs: 12, md: 4 }}>
              <Avatar
                src={settings?.author?.avatarUrl || undefined}
                alt={authorName}
                sx={{
                  width: { xs: 180, md: 220 },
                  height: { xs: 180, md: 220 },
                  mx: { xs: 'auto', md: 0 },
                  border: 3,
                  borderColor: 'primary.main',
                  boxShadow: (theme) => `0 0 30px ${alpha(theme.palette.primary.main, 0.25)}`,
                  bgcolor: 'grey.500',
                  fontSize: { xs: '4rem', md: '5rem' },
                }}
              >
                <Person sx={{ fontSize: { xs: 100, md: 120 } }} />
              </Avatar>
            </Grid2>

            <Grid2 size={{ xs: 12, md: 8 }}>
              <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
                About Me
              </Typography>
              <Typography variant="h5" color="text.secondary" sx={{ mb: 3, fontWeight: 400 }}>
                {tagline}
              </Typography>
              {intro.map((paragraph, i) => (
                <Typography
                  key={i}
                  variant="body1"
                  color="text.secondary"
                  paragraph
                  sx={{ mb: i < intro.length - 1 ? 2.5 : 0 }}
                >
                  {paragraph}
                </Typography>
              ))}
            </Grid2>
          </Grid2>
        </Box>

        {/* Story Section */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            mb: 6,
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.1)} 0%, ${alpha(theme.palette.secondary.dark, 0.05)} 100%)`
                : `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.1)} 0%, ${alpha(theme.palette.secondary.light, 0.05)} 100%)`,
          }}
        >
          <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
            My Journey
          </Typography>
          {story.map((paragraph, i) => (
            <Typography
              key={i}
              variant="body1"
              color="text.secondary"
              sx={{ mb: i < story.length - 1 ? 2.5 : 0 }}
            >
              {paragraph}
            </Typography>
          ))}
        </Paper>

        {/* Skills Section */}
        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" component="h2" sx={{ fontWeight: 600, mb: 3 }}>
            Skills &amp; Technologies
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {skills.map((skill) => (
              <Chip key={skill.name} label={skill.name} variant="outlined" size="medium" />
            ))}
          </Box>
        </Box>

        {/* Interests Section */}
        <Box>
          <Typography variant="h4" component="h2" sx={{ fontWeight: 600, mb: 3 }}>
            Interests
          </Typography>
          <Grid2 container spacing={2}>
            {interests.map((interest) => {
              const IconComponent = interest.icon;
              return (
                <Grid2 key={interest.label} size={{ xs: 6, sm: 4, md: 2 }}>
                  <Paper
                    sx={{
                      p: 2.5,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 120,
                      height: '100%',
                      transition: 'transform 0.2s',
                      '&:hover': { transform: 'translateY(-2px)' },
                    }}
                  >
                    <IconComponent sx={{ fontSize: 32, color: 'primary.main', mb: 1.5 }} />
                    <Typography
                      variant="body2"
                      fontWeight={500}
                      sx={{ textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word' }}
                    >
                      {interest.label}
                    </Typography>
                  </Paper>
                </Grid2>
              );
            })}
          </Grid2>
        </Box>
      </Container>
    </AuthAwareMainLayout>
  );
}
