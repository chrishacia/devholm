'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Container,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Pagination,
  Skeleton,
  Button,
  alpha,
} from '@mui/material';
import { AccessTime, CalendarToday, Code, ArrowBack, LocalOffer } from '@mui/icons-material';
import { format } from 'date-fns';
import { AuthAwareMainLayout, ThreeColumnLayout, SidebarWidget } from '@/components';
import Link from '@/components/common/Link';
import { SafeImage } from '@/components/common';
import type { PostWithTags, Tag } from '@/db/posts';

interface TagWithCount extends Tag {
  postCount: number;
}

interface TagArchiveClientProps {
  tagSlug: string;
  initialPosts: PostWithTags[];
  initialTag: Tag;
  initialTotalPages: number;
  initialTotalPosts: number;
  allTags: TagWithCount[];
}

interface PostCardProps {
  post: PostWithTags;
}

function PostCard({ post }: PostCardProps) {
  return (
    <Card
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: (theme) => `0 12px 24px ${alpha(theme.palette.common.black, 0.15)}`,
        },
      }}
    >
      <CardMedia
        component={Link}
        href={`/blog/${post.slug}`}
        sx={{
          width: { xs: '100%', sm: 200 },
          height: { xs: 160, sm: 'auto' },
          minHeight: { sm: 180 },
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {post.coverImage ? (
          <SafeImage
            src={post.coverImage}
            alt={post.title}
            width="100%"
            height="100%"
            objectFit="cover"
            showPlaceholder={false}
          />
        ) : (
          <Code sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.5 }} />
        )}
      </CardMedia>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ mb: 1 }}>
          {post.tags.slice(0, 3).map((tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              size="small"
              component={Link}
              href={`/blog/tag/${tag.slug}`}
              clickable
              sx={{ mr: 0.5, mb: 0.5, fontSize: '0.7rem' }}
            />
          ))}
        </Box>
        <Typography
          variant="h5"
          component={Link}
          href={`/blog/${post.slug}`}
          sx={{
            fontWeight: 600,
            mb: 1,
            textDecoration: 'none',
            color: 'inherit',
            '&:hover': { color: 'primary.main' },
          }}
        >
          {post.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, flex: 1 }}>
          {post.excerpt}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CalendarToday sx={{ fontSize: 14 }} />
            <Typography variant="caption" color="text.secondary">
              {post.publishedAt ? format(new Date(post.publishedAt), 'MMM d, yyyy') : 'Draft'}
            </Typography>
          </Box>
          {post.readingTime && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTime sx={{ fontSize: 14 }} />
              <Typography variant="caption" color="text.secondary">
                {post.readingTime} min read
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Card sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
      <Skeleton
        variant="rectangular"
        sx={{ width: { xs: '100%', sm: 200 }, height: { xs: 160, sm: 180 } }}
      />
      <CardContent sx={{ flex: 1 }}>
        <Skeleton width={100} height={24} />
        <Skeleton width="80%" height={32} sx={{ mt: 1 }} />
        <Skeleton width="100%" height={20} sx={{ mt: 1 }} />
        <Skeleton width="60%" height={20} sx={{ mt: 0.5 }} />
        <Skeleton width={120} height={16} sx={{ mt: 2 }} />
      </CardContent>
    </Card>
  );
}

function OtherTags({ currentSlug, tags }: { currentSlug: string; tags: TagWithCount[] }) {
  const otherTags = tags.filter((tag) => tag.slug !== currentSlug);

  return (
    <SidebarWidget title="Other Tags">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {otherTags.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No other tags
          </Typography>
        ) : (
          otherTags.map((tag) => (
            <Chip
              key={tag.id}
              label={`${tag.name} (${tag.postCount})`}
              size="small"
              component={Link}
              href={`/blog/tag/${tag.slug}`}
              clickable
              variant="outlined"
              sx={{ fontSize: '0.75rem' }}
            />
          ))
        )}
      </Box>
    </SidebarWidget>
  );
}

export default function TagArchiveClient({
  tagSlug,
  initialPosts,
  initialTag,
  initialTotalPages,
  initialTotalPosts,
  allTags,
}: TagArchiveClientProps) {
  const [posts, setPosts] = useState<PostWithTags[]>(initialPosts);
  const [tag, setTag] = useState<Tag>(initialTag);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [totalPosts, setTotalPosts] = useState(initialTotalPosts);
  const pageSize = 10;

  useEffect(() => {
    if (page === 1) {
      setPosts(initialPosts);
      setTag(initialTag);
      setTotalPages(initialTotalPages);
      setTotalPosts(initialTotalPosts);
      return;
    }

    const controller = new AbortController();

    const fetchPosts = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/posts/tag/${tagSlug}?page=${page}&pageSize=${pageSize}`,
          {
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          throw new Error('Failed to fetch posts');
        }

        const data = await response.json();
        setPosts(data.posts || []);
        setTag(data.tag || initialTag);
        setTotalPages(data.totalPages || 1);
        setTotalPosts(data.total || 0);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Error fetching posts:', error);
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchPosts();
    return () => controller.abort();
  }, [initialPosts, initialTag, initialTotalPages, initialTotalPosts, page, tagSlug]);

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Button component={Link} href="/blog" startIcon={<ArrowBack />} sx={{ mb: 4 }}>
          All Posts
        </Button>

        <Box sx={{ mb: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
              }}
            >
              <LocalOffer />
            </Box>
            <Typography variant="h2" component="h1" sx={{ fontWeight: 700 }}>
              {tag.name}
            </Typography>
          </Box>
          {tag.description && (
            <Typography variant="h6" color="text.secondary">
              {tag.description}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {totalPosts} {totalPosts === 1 ? 'post' : 'posts'} tagged with{' '}
            <strong>{tag.name}</strong>
          </Typography>
        </Box>

        <ThreeColumnLayout
          leftSidebar={null}
          rightSidebar={<OtherTags currentSlug={tagSlug} tags={allTags} />}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {loading ? (
              <>
                <LoadingSkeleton />
                <LoadingSkeleton />
              </>
            ) : posts.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No posts found with this tag
                </Typography>
                <Button component={Link} href="/blog" variant="outlined" sx={{ mt: 2 }}>
                  View All Posts
                </Button>
              </Box>
            ) : (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </Box>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                color="primary"
                size="large"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </ThreeColumnLayout>
      </Container>
    </AuthAwareMainLayout>
  );
}
