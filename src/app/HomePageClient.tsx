'use client';

import { Box, Typography, Button, Container, Card, CardContent, Chip, alpha } from '@mui/material';
import Link from '@/components/common/Link';
import { ArrowForward, Code, Article, Person } from '@mui/icons-material';
import { AuthAwareMainLayout, ThreeColumnLayout, SidebarWidget } from '@/components';
import { siteConfig } from '@/config';
import type { SiteSettings } from '@/hooks/useSiteSettings';

interface FeaturedPost {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  publishedAt: string | Date | null;
  tags: Array<{ id: string; name: string; slug: string }>;
}

interface TagData {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

interface HomePageClientProps {
  settings: SiteSettings;
  initialPosts: FeaturedPost[];
  initialTags: TagData[];
}

function LeftSidebar() {
  return (
    <>
      <SidebarWidget title="Quick Links">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[
            { label: 'About Me', href: '/about', icon: Person },
            { label: 'Latest Posts', href: '/blog', icon: Article },
            { label: 'Projects', href: '/projects', icon: Code },
          ].map((item) => (
            <Button
              key={item.href}
              component={Link}
              href={item.href}
              startIcon={<item.icon sx={{ fontSize: '1.25rem' }} />}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                px: 2,
                py: 1,
                gap: 1.5,
              }}
            >
              {item.label}
            </Button>
          ))}
        </Box>
      </SidebarWidget>
    </>
  );
}

function RightSidebar({ tags }: { tags: TagData[] }) {
  return (
    <>
      <SidebarWidget title="About">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.7 }}>
          I&apos;m a full-stack developer passionate about building beautiful, performant web
          applications. Currently exploring the intersection of design and engineering.
        </Typography>
        <Button
          component={Link}
          href="/about"
          variant="outlined"
          size="small"
          fullWidth
          endIcon={<ArrowForward sx={{ fontSize: '1rem' }} />}
          sx={{ gap: 1 }}
        >
          Learn More
        </Button>
      </SidebarWidget>

      <SidebarWidget title="Popular Tags">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {tags.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No tags yet
            </Typography>
          ) : (
            tags
              .slice(0, 8)
              .map((tag) => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  size="small"
                  component={Link}
                  href={`/blog/tag/${tag.slug}`}
                  clickable
                />
              ))
          )}
        </Box>
      </SidebarWidget>
    </>
  );
}

export default function HomePage({ settings, initialPosts, initialTags }: HomePageClientProps) {
  const featuredPosts = initialPosts;
  const tags = initialTags;

  const authorName = settings?.author?.name || siteConfig.author.name;

  return (
    <AuthAwareMainLayout>
      {/* Hero Section - Neo-Noir Atmospheric */}
      <Box
        sx={(theme) => ({
          py: { xs: 10, md: 14 },
          position: 'relative',
          overflow: 'hidden',
          background:
            theme.palette.mode === 'dark'
              ? `radial-gradient(ellipse at 30% 20%, ${alpha('#8B6BB5', 0.15)} 0%, transparent 50%),
                 radial-gradient(ellipse at 70% 80%, ${alpha('#D4A855', 0.1)} 0%, transparent 50%),
                 linear-gradient(180deg, ${theme.palette.background.default} 0%, ${alpha('#06060C', 0.8)} 100%)`
              : `radial-gradient(ellipse at 30% 20%, ${alpha('#8B6BB5', 0.08)} 0%, transparent 50%),
                 radial-gradient(ellipse at 70% 80%, ${alpha('#D4A855', 0.06)} 0%, transparent 50%),
                 linear-gradient(180deg, ${theme.palette.background.default} 0%, ${alpha('#F0EDE8', 0.5)} 100%)`,
          borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
          // Subtle animated glow
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '20%',
            left: '10%',
            width: '300px',
            height: '300px',
            background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 70%)`,
            animation: 'pulse 8s ease-in-out infinite',
            pointerEvents: 'none',
          },
          '@keyframes pulse': {
            '0%, 100%': { opacity: 0.5, transform: 'scale(1)' },
            '50%': { opacity: 0.8, transform: 'scale(1.1)' },
          },
        })}
      >
        <Container maxWidth="lg">
          <Box sx={{ maxWidth: 700, position: 'relative', zIndex: 1 }}>
            <Typography
              variant="h1"
              sx={{
                mb: 3,
                fontSize: { xs: '2.75rem', md: '3.75rem' },
                fontWeight: 600,
                lineHeight: 1.15,
              }}
            >
              Hey, I&apos;m{' '}
              <Box
                component="span"
                sx={(theme) => ({
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow:
                    theme.palette.mode === 'dark'
                      ? `0 0 40px ${alpha(theme.palette.primary.main, 0.4)}`
                      : 'none',
                })}
              >
                {authorName}
              </Box>
            </Typography>

            <Typography
              variant="h5"
              color="text.secondary"
              sx={{
                mb: 5,
                fontWeight: 400,
                lineHeight: 1.7,
                maxWidth: 600,
              }}
            >
              Full-stack developer crafting digital experiences. I write about web development,
              technology, and the occasional life update. Welcome to my corner of the internet.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
              <Button
                component={Link}
                href="/blog"
                variant="contained"
                size="large"
                endIcon={<ArrowForward />}
                sx={{ px: 4 }}
              >
                Read the Blog
              </Button>
              <Button component={Link} href="/about" variant="outlined" size="large" sx={{ px: 4 }}>
                About Me
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Main Content with Three Column Layout */}
      <ThreeColumnLayout leftSidebar={<LeftSidebar />} rightSidebar={<RightSidebar tags={tags} />}>
        {/* Featured Posts Section */}
        <Box sx={{ mb: 6 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 3,
            }}
          >
            <Typography variant="h4" component="h2" fontWeight={600}>
              Latest Posts
            </Typography>
            <Button component={Link} href="/blog" endIcon={<ArrowForward />} size="small">
              View All
            </Button>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {featuredPosts.length === 0 ? (
              <Card>
                <CardContent sx={{ p: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary">No posts yet. Check back soon!</Typography>
                </CardContent>
              </Card>
            ) : (
              featuredPosts.map((post) => (
                <Card
                  key={post.id}
                  component={Link}
                  href={`/blog/${post.slug}`}
                  sx={(theme) => ({
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: `0 8px 30px ${alpha(theme.palette.primary.main, 0.15)}`,
                      borderColor: alpha(theme.palette.primary.main, 0.3),
                    },
                  })}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Typography
                      variant="h6"
                      component="h3"
                      sx={{
                        mb: 1,
                        fontWeight: 600,
                        color: 'text.primary',
                      }}
                    >
                      {post.title}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {post.excerpt}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      {post.tags.slice(0, 3).map((tag) => (
                        <Chip key={tag.id} label={tag.name} size="small" variant="outlined" />
                      ))}
                      <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                        {post.publishedAt
                          ? new Date(post.publishedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'Draft'}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        </Box>

        {/* CTA Section */}
        <Card
          sx={(theme) => ({
            p: 4,
            textAlign: 'center',
            background:
              theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.3)} 0%, ${alpha(theme.palette.secondary.dark, 0.2)} 100%)`
                : `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.2)} 0%, ${alpha(theme.palette.secondary.light, 0.1)} 100%)`,
          })}
        >
          <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
            Let&apos;s Connect
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Have a question or want to work together? I&apos;d love to hear from you.
          </Typography>
          <Button
            component={Link}
            href="/contact"
            variant="contained"
            size="large"
            endIcon={<ArrowForward />}
          >
            Get in Touch
          </Button>
        </Card>
      </ThreeColumnLayout>
    </AuthAwareMainLayout>
  );
}
