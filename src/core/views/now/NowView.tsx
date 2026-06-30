'use client';

/**
 * Now View — Core
 * ===============
 *
 * Layout and structure for the /now page.
 * Content comes from devholm.config.ts → content.now.
 *
 * To customize: Edit src/user/content/now.ts
 * For full layout control: pnpm devholm eject now
 */

import { Box, Typography, Container, Grid2, Paper, Chip, Divider, alpha } from '@mui/material';
import { Work, LocationOn, Update } from '@mui/icons-material';
import { format } from 'date-fns';
import { AuthAwareMainLayout } from '@/components';
import type { NowContent } from '@core/types/content';

interface NowViewProps {
  content: NowContent;
}

export default function NowView({ content }: NowViewProps) {
  const { lastUpdated, location, currentProject, sections, focus } = content;

  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Now
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 2 }}>
            What I&apos;m currently focused on. This is a{' '}
            <Box
              component="a"
              href="https://nownownow.com/about"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'primary.main' }}
            >
              /now page
            </Box>
            .
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
            <Update fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">
              Last updated: {format(lastUpdated, 'MMMM d, yyyy')}
            </Typography>
          </Box>
        </Box>

        {/* Location */}
        <Paper
          sx={{
            p: 3,
            mb: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: (theme) =>
              theme.palette.mode === 'dark'
                ? alpha(theme.palette.primary.dark, 0.1)
                : alpha(theme.palette.primary.light, 0.1),
          }}
          elevation={0}
        >
          <LocationOn color="primary" sx={{ fontSize: 20 }} />
          <Typography variant="body1" fontWeight={500}>
            {location}
          </Typography>
        </Paper>

        {/* Current Project Section */}
        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
            <Work sx={{ mr: 1.5, verticalAlign: 'middle' }} />
            Current Project: {currentProject.name}
          </Typography>

          <Paper
            sx={{
              p: { xs: 3, md: 4 },
              background: (theme) =>
                theme.palette.mode === 'dark'
                  ? `linear-gradient(135deg, ${alpha(theme.palette.secondary.dark, 0.15)} 0%, ${alpha(theme.palette.primary.dark, 0.1)} 100%)`
                  : `linear-gradient(135deg, ${alpha(theme.palette.secondary.light, 0.15)} 0%, ${alpha(theme.palette.primary.light, 0.1)} 100%)`,
            }}
            elevation={0}
          >
            <Typography variant="h6" color="primary" gutterBottom sx={{ fontWeight: 500 }}>
              {currentProject.tagline}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 3, whiteSpace: 'pre-line' }}
            >
              {currentProject.description}
            </Typography>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Tech Stack
            </Typography>
            <Grid2 container spacing={2} sx={{ mb: 3 }}>
              {Object.entries(currentProject.techStack).map(([category, techs]) => (
                <Grid2 key={category} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textTransform: 'uppercase' }}
                  >
                    {category}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                    {techs.map((tech) => (
                      <Chip key={tech} label={tech} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Grid2>
              ))}
            </Grid2>

            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Key Features
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2, columns: { xs: 1, md: 2 }, columnGap: 4 }}>
              {currentProject.features.map((feature, i) => (
                <Typography
                  key={i}
                  component="li"
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1, breakInside: 'avoid' }}
                >
                  {feature}
                </Typography>
              ))}
            </Box>
          </Paper>
        </Box>

        {/* Sections */}
        <Grid2 container spacing={3} sx={{ mb: 6 }}>
          {sections.map((section, index) => {
            const IconComponent = section.icon;
            return (
              <Grid2 key={index} size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.1),
                        color: 'secondary.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconComponent sx={{ fontSize: 20 }} />
                    </Box>
                    <Typography variant="h6" component="h2" fontWeight={600}>
                      {section.title}
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {section.items.map((item, itemIndex) => (
                      <Typography
                        key={itemIndex}
                        component="li"
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 1 }}
                      >
                        {item}
                      </Typography>
                    ))}
                  </Box>
                </Paper>
              </Grid2>
            );
          })}
        </Grid2>

        {/* Current Focus */}
        <Paper
          sx={{
            p: 4,
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.15)} 0%, ${alpha(theme.palette.secondary.dark, 0.1)} 100%)`
                : `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.15)} 0%, ${alpha(theme.palette.secondary.light, 0.1)} 100%)`,
          }}
          elevation={0}
        >
          <Typography
            variant="h6"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 600, textAlign: 'center', mb: 3 }}
          >
            Current Focus Areas
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center' }}>
            {focus.map((item) => (
              <Chip key={item} label={item} color="primary" variant="outlined" />
            ))}
          </Box>
        </Paper>
      </Container>
    </AuthAwareMainLayout>
  );
}
