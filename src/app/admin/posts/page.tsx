'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TablePagination,
  Skeleton,
  alpha,
} from '@mui/material';
import {
  Add,
  Search,
  Edit,
  Delete,
  MoreVert,
  Visibility,
  Schedule,
  Archive,
  FilterList,
  Article,
} from '@mui/icons-material';
import { format } from 'date-fns';
import Link from '@/components/common/Link';

// Post interface matching API response
interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: 'draft' | 'published' | 'archived' | 'scheduled';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  coverImage: string | null;
  tags: string[];
}

interface PostsResponse {
  posts: Post[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const statusColors: Record<string, 'success' | 'warning' | 'info' | 'default'> = {
  published: 'success',
  draft: 'warning',
  scheduled: 'info',
  archived: 'default',
};

const statusIcons: Record<string, React.ReactElement> = {
  published: <Visibility sx={{ fontSize: 14 }} />,
  draft: <Edit sx={{ fontSize: 14 }} />,
  scheduled: <Schedule sx={{ fontSize: 14 }} />,
  archived: <Archive sx={{ fontSize: 14 }} />,
};

function LoadingSkeleton() {
  return (
    <TableBody>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton width="80%" />
          </TableCell>
          <TableCell>
            <Skeleton width={80} />
          </TableCell>
          <TableCell>
            <Skeleton width={100} />
          </TableCell>
          <TableCell>
            <Skeleton width={40} />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

export default function PostsListPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalPosts, setTotalPosts] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page + 1),
        limit: String(rowsPerPage),
        ...(statusFilter && { status: statusFilter }),
        ...(debouncedSearch && { search: debouncedSearch }),
      });

      const response = await fetch(`/api/admin/posts?${params}`);
      if (!response.ok) throw new Error('Failed to fetch posts');

      const data: PostsResponse = await response.json();
      setPosts(data.posts);
      setTotalPosts(data.pagination.total);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, post: Post) => {
    setAnchorEl(event.currentTarget);
    setSelectedPost(post);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    // Don't clear selectedPost here - it may be needed for the delete dialog
  };

  const handleDeleteClick = () => {
    setAnchorEl(null); // Close menu but keep selectedPost
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPost) return;

    try {
      const response = await fetch(`/api/admin/posts/${selectedPost.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete post');

      await fetchPosts();
      setDeleteDialogOpen(false);
      setSelectedPost(null);
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: { xs: 2, sm: 4 },
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            fontWeight={700}
            gutterBottom
            sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' } }}
          >
            Blog Posts
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
          >
            Manage your blog posts and content
          </Typography>
        </Box>
        <Button
          component={Link}
          href="/admin/posts/new"
          variant="contained"
          startIcon={<Add />}
          size="small"
        >
          New Post
        </Button>
      </Box>

      {/* Filters and Search */}
      <Card sx={{ mb: 3 }}>
        <Box
          sx={{
            p: { xs: 1.5, sm: 2 },
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <TextField
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 }, maxWidth: { xs: '100%', sm: 400 } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button
            variant="outlined"
            startIcon={<FilterList />}
            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
            color={statusFilter ? 'primary' : 'inherit'}
            size="small"
            sx={{ height: 40 }}
          >
            {statusFilter ? `Filter: ${statusFilter}` : 'Filter'}
          </Button>
          <Menu
            anchorEl={filterAnchorEl}
            open={Boolean(filterAnchorEl)}
            onClose={() => setFilterAnchorEl(null)}
          >
            <MenuItem
              onClick={() => {
                setStatusFilter(null);
                setFilterAnchorEl(null);
              }}
            >
              All Posts
            </MenuItem>
            {['published', 'draft', 'scheduled', 'archived'].map((status) => (
              <MenuItem
                key={status}
                onClick={() => {
                  setStatusFilter(status);
                  setFilterAnchorEl(null);
                }}
                selected={statusFilter === status}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </MenuItem>
            ))}
          </Menu>
        </Box>
      </Card>

      {/* Posts Table */}
      <Card sx={{ overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto', maxWidth: '100%' }}>
          <Table sx={{ minWidth: 280 }} size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ maxWidth: { xs: 150, sm: 300 } }}>Title</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Date</TableCell>
                <TableCell align="right" sx={{ width: 50 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            {loading ? (
              <LoadingSkeleton />
            ) : (
              <TableBody>
                {posts.map((post) => (
                  <TableRow
                    key={post.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => (window.location.href = `/admin/posts/${post.id}/edit`)}
                  >
                    <TableCell sx={{ maxWidth: { xs: 150, sm: 250, md: 350 }, overflow: 'hidden' }}>
                      <Box sx={{ overflow: 'hidden' }}>
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          sx={{
                            fontSize: { xs: '0.8rem', sm: '0.875rem' },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {post.title}
                        </Typography>
                        <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, mt: 0.5 }}>
                          {(post.tags || []).slice(0, 3).map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                              }}
                            />
                          ))}
                          {(post.tags || []).length > 3 && (
                            <Typography variant="caption" color="text.secondary">
                              +{post.tags.length - 3}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={post.status}
                        size="small"
                        color={statusColors[post.status]}
                        icon={statusIcons[post.status]}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="body2" color="text.secondary">
                        {post.status === 'scheduled' && post.publishedAt
                          ? `Scheduled: ${format(new Date(post.publishedAt), 'MMM d, yyyy')}`
                          : post.publishedAt
                            ? format(new Date(post.publishedAt), 'MMM d, yyyy')
                            : `Updated: ${format(new Date(post.updatedAt), 'MMM d, yyyy')}`}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <IconButton size="small" onClick={(e) => handleMenuOpen(e, post)}>
                        <MoreVert />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {posts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 8 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Article sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                          No posts found
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            )}
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalPosts}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </Card>

      {/* Actions Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem
          component={Link}
          href={`/admin/posts/${selectedPost?.id}/edit`}
          onClick={handleMenuClose}
        >
          <Edit sx={{ mr: 1, fontSize: 18 }} />
          Edit
        </MenuItem>
        {selectedPost?.status === 'published' && (
          <MenuItem
            component={Link}
            href={`/blog/${selectedPost?.slug}`}
            target="_blank"
            onClick={handleMenuClose}
          >
            <Visibility sx={{ mr: 1, fontSize: 18 }} />
            View Live
          </MenuItem>
        )}
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          <Delete sx={{ mr: 1, fontSize: 18 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setSelectedPost(null);
        }}
      >
        <DialogTitle>Delete Post</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{selectedPost?.title}&quot;? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
              setSelectedPost(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
