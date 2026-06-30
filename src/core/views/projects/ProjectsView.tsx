'use client';

import {
  Box,
  Typography,
  Container,
  Grid2,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Button,
  Chip,
  alpha,
} from '@mui/material';
import { GitHub, Launch, Code, Lock } from '@mui/icons-material';
import { AuthAwareMainLayout } from '@/components';
import Link from '@/components/common/Link';

interface Project {
  id: string;
  title: string;
  slug: string;
  description: string;
  image_url: string | null;
  github_url: string | null;
  live_url: string | null;
  is_featured: boolean;
  technologies: string[];
}

interface ProjectsPageClientProps {
  projects: Project[];
}

export default function ProjectsPage({ projects }: ProjectsPageClientProps) {
  const featuredProjects = projects.filter((p) => p.is_featured);
  const otherProjects = projects.filter((p) => !p.is_featured);

  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 8, md: 12 } }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Projects
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 700, mx: 'auto' }}>
            These are projects of my past, present, future, and occasional hyperfocus. I have a lot
            of ideas, and I&apos;m always looking for new ones. If you have an idea and need a
            developer, please <Link href="/contact">contact me</Link>.
          </Typography>
        </Box>

        <>
          {/* Featured Projects */}
          {featuredProjects.length > 0 && (
            <Box sx={{ mb: { xs: 8, md: 12 } }}>
              <Typography variant="h4" component="h2" sx={{ fontWeight: 600, mb: 4 }}>
                Featured Projects
              </Typography>
              <Grid2 container spacing={3}>
                {featuredProjects.map((project) => (
                  <Grid2 key={project.id} size={{ xs: 12, md: 6, lg: 4 }}>
                    <Card
                      sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: (theme) =>
                            `0 12px 24px ${alpha(theme.palette.common.black, 0.15)}`,
                        },
                      }}
                    >
                      <CardMedia
                        component="div"
                        sx={{
                          height: 160,
                          bgcolor: 'action.hover',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundImage: project.image_url ? `url(${project.image_url})` : 'none',
                          backgroundSize: 'contain',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          p: 2,
                        }}
                      >
                        {!project.image_url && (
                          <Code sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }} />
                        )}
                      </CardMedia>
                      <CardContent sx={{ flexGrow: 1, p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="h6" component="h3" fontWeight={600}>
                            {project.title}
                          </Typography>
                          {!project.github_url && !project.live_url && (
                            <Lock sx={{ fontSize: 16, color: 'text.secondary' }} />
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                          {project.description}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {project.technologies.map((tech) => (
                            <Chip key={tech} label={tech} size="small" variant="outlined" />
                          ))}
                        </Box>
                      </CardContent>
                      <CardActions sx={{ px: 3, pb: 3, pt: 0, gap: 1 }}>
                        {project.github_url && (
                          <Button
                            size="small"
                            startIcon={<GitHub sx={{ fontSize: '1rem' }} />}
                            component={Link}
                            href={project.github_url}
                            target="_blank"
                            sx={{ gap: 0.5 }}
                          >
                            GitHub
                          </Button>
                        )}
                        {project.live_url && (
                          <Button
                            size="small"
                            startIcon={<Launch sx={{ fontSize: '1rem' }} />}
                            component={Link}
                            href={project.live_url}
                            target="_blank"
                            sx={{ gap: 0.5 }}
                          >
                            Live
                          </Button>
                        )}
                      </CardActions>
                    </Card>
                  </Grid2>
                ))}
              </Grid2>
            </Box>
          )}

          {/* Other Projects */}
          {otherProjects.length > 0 && (
            <Box sx={{ mb: { xs: 8, md: 12 } }}>
              <Typography variant="h4" component="h2" sx={{ fontWeight: 600, mb: 4 }}>
                Other Projects
              </Typography>
              <Grid2 container spacing={3}>
                {otherProjects.map((project) => (
                  <Grid2 key={project.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                    <Card
                      sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      variant="outlined"
                    >
                      <CardContent sx={{ flexGrow: 1, p: 3 }}>
                        <Typography variant="h6" component="h3" gutterBottom fontWeight={600}>
                          {project.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                          {project.description}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {project.technologies.map((tech) => (
                            <Chip key={tech} label={tech} size="small" variant="outlined" />
                          ))}
                        </Box>
                      </CardContent>
                      <CardActions sx={{ px: 3, pb: 3, pt: 0, gap: 1 }}>
                        {project.github_url && (
                          <Button
                            size="small"
                            startIcon={<GitHub sx={{ fontSize: '1rem' }} />}
                            component={Link}
                            href={project.github_url}
                            target="_blank"
                            sx={{ gap: 0.5 }}
                          >
                            GitHub
                          </Button>
                        )}
                        {project.live_url && (
                          <Button
                            size="small"
                            startIcon={<Launch sx={{ fontSize: '1rem' }} />}
                            component={Link}
                            href={project.live_url}
                            target="_blank"
                            sx={{ gap: 0.5 }}
                          >
                            Live
                          </Button>
                        )}
                      </CardActions>
                    </Card>
                  </Grid2>
                ))}
              </Grid2>
            </Box>
          )}
        </>

        {/* Call to Action */}
        <Box
          sx={{
            p: { xs: 4, md: 5 },
            textAlign: 'center',
            borderRadius: 2,
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? alpha(theme.palette.primary.dark, 0.1)
                : alpha(theme.palette.primary.light, 0.1),
          }}
        >
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Interested in Collaborating?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            I&apos;m always open to discussing new projects, creative ideas, or opportunities.
          </Typography>
          <Button variant="contained" size="large" component={Link} href="/contact">
            Get in Touch
          </Button>
        </Box>
      </Container>
    </AuthAwareMainLayout>
  );
}
