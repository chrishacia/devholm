'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Container,
  Chip,
  Divider,
  Avatar,
  Skeleton,
  Button,
  Paper,
} from '@mui/material';
import { AccessTime, CalendarToday, ArrowBack, Twitter, LinkedIn } from '@mui/icons-material';
import { format } from 'date-fns';
import { AuthAwareMainLayout, ThreeColumnLayout, SidebarWidget } from '@/components';
import Link from '@/components/common/Link';
import { MarkdownRenderer, SafeImage } from '@/components/common';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import type { PostWithTags } from '@/db/posts';

interface PostWithRenderHtml extends PostWithTags {
  renderedHtml?: string;
}

function TableOfContents({ content }: { content: string }) {
  // Extract headings from markdown content
  const headings = content
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => {
      const text = line.replace('## ', '');
      const id = text
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
      return { text, id };
    });

  if (headings.length === 0) return null;

  return (
    <SidebarWidget title="Table of Contents">
      <Box component="nav" aria-label="Table of contents">
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {headings.map((heading) => (
            <Box
              key={heading.id}
              component="li"
              sx={{
                py: 0.5,
                borderLeft: 2,
                borderColor: 'transparent',
                pl: 2,
                transition: 'border-color 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                },
              }}
            >
              <Box
                component="a"
                href={`#${heading.id}`}
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                {heading.text}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </SidebarWidget>
  );
}

function ShareButtons({ url, title }: { url: string; title: string }) {
  const shareOnTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      '_blank'
    );
  };

  const shareOnLinkedIn = () => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      '_blank'
    );
  };

  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button size="small" variant="outlined" startIcon={<Twitter />} onClick={shareOnTwitter}>
        Share
      </Button>
      <Button size="small" variant="outlined" startIcon={<LinkedIn />} onClick={shareOnLinkedIn}>
        Share
      </Button>
    </Box>
  );
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { settings } = useSiteSettings();
  const [post, setPost] = useState<PostWithRenderHtml | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPost = async () => {
      if (!slug) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/posts/${slug}`);

        if (!response.ok) {
          if (response.status === 404) {
            setPost(null);
          } else {
            throw new Error('Failed to fetch post');
          }
        } else {
          const data = await response.json();
          // Convert date strings to Date objects
          setPost({
            ...data,
            publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
          });
        }
      } catch (err) {
        console.error('Error fetching post:', err);
        setError('Failed to load post');
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <AuthAwareMainLayout>
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Skeleton width={100} height={32} />
          <Skeleton width="80%" height={60} sx={{ mt: 2 }} />
          <Skeleton width={200} height={24} sx={{ mt: 2 }} />
          <Skeleton variant="rectangular" height={400} sx={{ mt: 4 }} />
        </Container>
      </AuthAwareMainLayout>
    );
  }

  if (error) {
    return (
      <AuthAwareMainLayout>
        <Container maxWidth="lg" sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom>
            {error}
          </Typography>
          <Button component={Link} href="/blog" startIcon={<ArrowBack />}>
            Back to Blog
          </Button>
        </Container>
      </AuthAwareMainLayout>
    );
  }

  if (!post) {
    return (
      <AuthAwareMainLayout>
        <Container maxWidth="lg" sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom>
            Post not found
          </Typography>
          <Button component={Link} href="/blog" startIcon={<ArrowBack />}>
            Back to Blog
          </Button>
        </Container>
      </AuthAwareMainLayout>
    );
  }

  const postUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/blog/${post.slug}`
      : `${settings?.site?.url || ''}/blog/${post.slug}`;

  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: 6 }}>
        {/* Back Link */}
        <Button component={Link} href="/blog" startIcon={<ArrowBack />} sx={{ mb: 4 }}>
          Back to Blog
        </Button>

        <ThreeColumnLayout
          leftSidebar={null}
          rightSidebar={<TableOfContents content={post.contentMarkdown} />}
        >
          {/* Article Header */}
          <Box component="article">
            <Box sx={{ mb: 4 }}>
              {/* Tags */}
              <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {post.tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    size="small"
                    component={Link}
                    href={`/blog/tag/${tag.slug}`}
                    clickable
                  />
                ))}
              </Box>

              {/* Title */}
              <Typography
                variant="h2"
                component="h1"
                gutterBottom
                sx={{ fontWeight: 700, lineHeight: 1.2 }}
              >
                {post.title}
              </Typography>

              {/* Meta */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 2,
                  mb: 3,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar
                    src={settings?.author?.avatarUrl || '/images/avatar.jpg'}
                    alt={settings?.author?.name || 'Author'}
                    sx={{ width: 40, height: 40 }}
                  />
                  <Typography variant="body2">{settings?.author?.name || 'Author'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CalendarToday sx={{ fontSize: 16 }} />
                  <Typography variant="body2" color="text.secondary">
                    {post.publishedAt ? format(post.publishedAt, 'MMMM d, yyyy') : 'Draft'}
                  </Typography>
                </Box>
                {post.readingTime && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccessTime sx={{ fontSize: 16 }} />
                    <Typography variant="body2" color="text.secondary">
                      {post.readingTime} min read
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Cover Image */}
              {post.coverImage && (
                <SafeImage
                  src={post.coverImage}
                  alt={post.title}
                  width="100%"
                  height="auto"
                  fallbackText="Cover image unavailable"
                  sx={{
                    borderRadius: 2,
                    mb: 4,
                  }}
                />
              )}
            </Box>

            {/* Article Content */}
            <Paper
              sx={{
                p: { xs: 2, md: 3 },
              }}
            >
              {post.renderedHtml ? (
                <Box
                  sx={{
                    '& h1, & h2, & h3, & h4': { mt: 3, mb: 1.5 },
                    '& p': { mb: 2, lineHeight: 1.8 },
                    '& ul, & ol': { mb: 2, pl: 2.5, ml: 0 },
                    '& li': { mb: 0.5 },
                    '& img, & video, & iframe': { maxWidth: '100%', borderRadius: 1 },
                    '& .devholm-embed': {
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      p: 2,
                      mb: 2,
                    },
                    '& .gallery-grid': {
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 2,
                    },
                  }}
                  dangerouslySetInnerHTML={{ __html: post.renderedHtml }}
                />
              ) : (
                <MarkdownRenderer content={post.contentMarkdown} />
              )}
            </Paper>

            {/* Share Section */}
            <Divider sx={{ my: 4 }} />
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Typography variant="subtitle1" fontWeight={600}>
                Share this post
              </Typography>
              <ShareButtons url={postUrl} title={post.title} />
            </Box>

            {/* Tags Section */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                Tagged with:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {post.tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    size="small"
                    component={Link}
                    href={`/blog/tag/${tag.slug}`}
                    clickable
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </ThreeColumnLayout>
      </Container>
    </AuthAwareMainLayout>
  );
}
