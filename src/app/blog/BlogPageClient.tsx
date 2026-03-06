'use client';

import { useState, useEffect } from 'react';
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
  alpha,
} from '@mui/material';
import { AccessTime, CalendarToday, Code } from '@mui/icons-material';
import { format } from 'date-fns';
import { AuthAwareMainLayout, ThreeColumnLayout, SidebarWidget } from '@/components';
import Link from '@/components/common/Link';
import { SafeImage } from '@/components/common';
import type { PostWithTags, Tag } from '@/db/posts';

interface TagWithCount extends Tag {
  postCount: number;
}

interface BlogPageClientProps {
  initialPosts: PostWithTags[];
  initialTotalPages: number;
  initialTotalPosts: number;
  initialTags: TagWithCount[];
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
      <CardContent
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: { xs: 2.5, md: 3 } }}
      >
        <Box sx={{ mb: 1.5 }}>
          {post.tags.slice(0, 3).map((tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              size="small"
              component={Link}
              href={`/blog/tag/${tag.slug}`}
              clickable
              sx={{ mr: 1.5, mb: 1 }}
            />
          ))}
        </Box>
        <Typography
          variant="h5"
          component={Link}
          href={`/blog/${post.slug}`}
          sx={{
            fontWeight: 600,
            mb: 1.5,
            textDecoration: 'none',
            color: 'inherit',
            '&:hover': { color: 'primary.main' },
          }}
        >
          {post.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, flex: 1 }}>
          {post.excerpt}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarToday sx={{ fontSize: 14 }} />
            <Typography variant="caption" color="text.secondary">
              {post.publishedAt ? format(new Date(post.publishedAt), 'MMM d, yyyy') : 'Draft'}
            </Typography>
          </Box>
          {post.readingTime && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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

function RightSidebar({ tags }: { tags: TagWithCount[] }) {
  return (
    <>
      <SidebarWidget title="Tags">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {tags.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No tags yet
            </Typography>
          ) : (
            tags.map((tag) => (
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
      <SidebarWidget title="Subscribe">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Get notified when I publish new posts.
        </Typography>
        <Chip
          label="RSS Feed"
          component={Link}
          href="/blog/rss.xml"
          clickable
          color="primary"
          variant="outlined"
        />
      </SidebarWidget>
    </>
  );
}

export default function BlogPage({
  initialPosts,
  initialTotalPages,
  initialTotalPosts,
  initialTags,
}: BlogPageClientProps) {
  const [posts, setPosts] = useState<PostWithTags[]>(initialPosts);
  const [tags] = useState<TagWithCount[]>(initialTags);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [totalPosts, setTotalPosts] = useState(initialTotalPosts);
  const pageSize = 10;

  // Fetch posts only when page > 1 (page 1 is SSR'd)
  useEffect(() => {
    if (page === 1) {
      // Use SSR data for page 1
      setPosts(initialPosts);
      setTotalPages(initialTotalPages);
      setTotalPosts(initialTotalPosts);
      return;
    }

    const controller = new AbortController();

    const fetchPosts = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/posts?page=${page}&pageSize=${pageSize}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to fetch posts');
        const data = await response.json();
        setPosts(data.posts || []);
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

    fetchPosts();
    return () => controller.abort();
  }, [page, initialPosts, initialTotalPages, initialTotalPosts]);

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 8, md: 12 } }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Blog
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Thoughts on software development, design, and technology.
          </Typography>
          {!loading && totalPosts > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {totalPosts} posts
            </Typography>
          )}
        </Box>

        <ThreeColumnLayout leftSidebar={null} rightSidebar={<RightSidebar tags={tags} />}>
          {/* Posts List */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {loading ? (
              <>
                <LoadingSkeleton />
                <LoadingSkeleton />
                <LoadingSkeleton />
                <LoadingSkeleton />
                <LoadingSkeleton />
              </>
            ) : posts.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 8,
                  bgcolor: 'action.hover',
                  borderRadius: 2,
                }}
              >
                <Typography variant="h6" color="text.secondary">
                  No posts yet. Check back soon!
                </Typography>
              </Box>
            ) : (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </Box>

          {/* Pagination */}
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
