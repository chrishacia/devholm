'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Grid2 as Grid,
  Card,
  CardContent,
  Typography,
  IconButton,
  alpha,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Button,
  Skeleton,
  Alert,
  Stack,
} from '@mui/material';
import {
  Article,
  Inbox,
  TrendingUp,
  Visibility,
  Edit,
  ArrowForward,
  Schedule,
  Email,
  CalendarToday,
  Checklist,
  Close,
  Security,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import Link from '@/components/common/Link';

// Interface for dashboard data
interface DashboardData {
  stats: {
    posts: {
      total: number;
      published: number;
      draft: number;
      scheduled: number;
      archived: number;
    };
    messages: {
      total: number;
      unread: number;
      read: number;
      archived: number;
      spam: number;
    };
  };
  recentPosts: {
    id: string;
    title: string;
    slug: string;
    status: string;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  recentMessages: {
    id: string;
    name: string | null;
    email: string | null;
    subject: string | null;
    status: string;
    createdAt: string;
    readAt: string | null;
  }[];
  onboarding: {
    dismissed: boolean;
    recoveryOverrideEnabled: boolean;
    providersReady: number;
    pendingInvitations: number;
    linkedAccountCount: number;
    items: Array<{
      key: string;
      title: string;
      description: string;
      href: string;
      completed: boolean;
    }>;
  };
}

interface StatCardProps {
  label: string;
  value: string | number;
  change: string;
  icon: React.ReactNode;
  color: string;
  href: string;
}

function StatCard({ label, value, change, icon, color, href }: StatCardProps) {
  return (
    <Card
      component={Link}
      href={href}
      sx={{
        textDecoration: 'none',
        transition: 'transform 0.2s, box-shadow 0.2s',
        height: '100%',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: (theme) => `0 8px 24px ${alpha(theme.palette.common.black, 0.12)}`,
        },
      }}
    >
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 }, '&:last-child': { pb: { xs: 1.5, sm: 2.5 } } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' }, mb: 0.5 }}
            >
              {label}
            </Typography>
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem' }, lineHeight: 1.2 }}
            >
              {value}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ mt: 0.5, display: 'block', fontSize: { xs: '0.6rem', sm: '0.7rem' } }}
            >
              {change}
            </Typography>
          </Box>
          <Box
            sx={{
              p: { xs: 0.75, sm: 1.25 },
              borderRadius: 1.5,
              bgcolor: alpha(color, 0.12),
              color: color,
              flexShrink: 0,
              ml: 1,
              '& svg': { fontSize: { xs: 18, sm: 22 }, display: 'block' },
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Box>
      <Grid container spacing={3}>
        {[1, 2, 3, 4].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Skeleton variant="rounded" height={140} />
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={3} sx={{ mt: 3 }}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Skeleton variant="rounded" height={380} />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Skeleton variant="rounded" height={380} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch('/api/admin/dashboard');
        if (!response.ok) throw new Error('Failed to fetch dashboard');
        const dashboardData = await response.json();
        setData(dashboardData);
        setBannerDismissed(Boolean(dashboardData.onboarding?.dismissed));
      } catch (error) {
        console.error('Error fetching dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading || !data) {
    return <LoadingSkeleton />;
  }

  const stats = [
    {
      label: 'Total Posts',
      value: data.stats.posts.total,
      change: `${data.stats.posts.draft} drafts, ${data.stats.posts.scheduled} scheduled`,
      icon: <Article />,
      color: '#6B5B95',
      href: '/admin/posts',
    },
    {
      label: 'Unread Messages',
      value: data.stats.messages.unread,
      change: `${data.stats.messages.total} total messages`,
      icon: <Inbox />,
      color: '#C4A052',
      href: '/admin/inbox',
    },
    {
      label: 'Published Posts',
      value: data.stats.posts.published,
      change: `${data.stats.posts.archived} archived`,
      icon: <Visibility />,
      color: '#2E86AB',
      href: '/admin/posts',
    },
    {
      label: 'Archived Messages',
      value: data.stats.messages.archived,
      change: `${data.stats.messages.spam} spam`,
      icon: <TrendingUp />,
      color: '#22C55E',
      href: '/admin/inbox',
    },
  ];

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Page Header */}
      <Box sx={{ mb: { xs: 2, sm: 4 } }}>
        <Typography
          variant="h4"
          fontWeight={700}
          gutterBottom
          sx={{ fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' } }}
        >
          Dashboard
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ fontSize: { xs: '0.8rem', sm: '1rem' } }}
        >
          Welcome back! Here&apos;s an overview of your site.
        </Typography>
      </Box>

      {!bannerDismissed ? (
        <Card
          sx={{
            mb: 3,
            borderRadius: 4,
            background: (theme) =>
              `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.secondary.main, 0.12)} 100%)`,
            border: 1,
            borderColor: 'divider',
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 2,
                flexWrap: 'wrap',
                mb: 2.5,
              }}
            >
              <Box>
                <Chip icon={<Checklist />} label="Post-setup checklist" sx={{ mb: 1.5 }} />
                <Typography variant="h5" fontWeight={800} gutterBottom>
                  Finish the secure bits before you invite people in.
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 760 }}>
                  Registration can stay off while you configure providers, generate invite-only
                  onboarding links, and attach a backup provider to your own account.
                </Typography>
              </Box>
              <Button
                variant="text"
                color="inherit"
                startIcon={<Close />}
                onClick={async () => {
                  try {
                    await fetch('/api/admin/dashboard', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'dismiss-onboarding' }),
                    });
                    setBannerDismissed(true);
                  } catch (dismissError) {
                    console.error('Failed to dismiss onboarding banner:', dismissError);
                  }
                }}
              >
                Dismiss
              </Button>
            </Box>

            {data.onboarding.recoveryOverrideEnabled ? (
              <Alert severity="warning" sx={{ mb: 2.5 }} icon={<Security fontSize="inherit" />}>
                Setup recovery override is active via <strong>AUTH_SETUP_BYPASS=true</strong>. Turn
                it off after you have recovered from setup trouble so wizard protections are
                restored.
              </Alert>
            ) : null}

            <Grid container spacing={2}>
              {data.onboarding.items.map((item) => (
                <Grid key={item.key} size={{ xs: 12, md: 4 }}>
                  <Card sx={{ height: '100%', borderRadius: 3 }}>
                    <CardContent>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ mb: 1.5 }}
                      >
                        <Typography variant="subtitle1" fontWeight={700}>
                          {item.title}
                        </Typography>
                        <Chip
                          size="small"
                          label={item.completed ? 'Done' : 'Pending'}
                          color={item.completed ? 'success' : 'default'}
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {item.description}
                      </Typography>
                      <Button
                        component={Link}
                        href={item.href}
                        variant={item.completed ? 'outlined' : 'contained'}
                        size="small"
                      >
                        {item.completed ? 'Review' : 'Open'}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats Grid */}
      <Grid container spacing={{ xs: 1, sm: 2, md: 3 }}>
        {stats.map((stat) => (
          <Grid key={stat.label} size={{ xs: 6, sm: 6, lg: 3 }}>
            <StatCard {...stat} />
          </Grid>
        ))}
      </Grid>

      {/* Recent Activity */}
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mt: { xs: 2, sm: 3 } }}>
        {/* Recent Posts */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ pb: 0, p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2,
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Typography
                  variant="h6"
                  fontWeight={600}
                  sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                >
                  Recent Posts
                </Typography>
                <Button
                  component={Link}
                  href="/admin/posts"
                  endIcon={<ArrowForward />}
                  size="small"
                >
                  View All
                </Button>
              </Box>
              <Divider />
            </CardContent>
            <List>
              {data.recentPosts.map((post, index) => (
                <ListItem
                  key={post.id}
                  divider={index < data.recentPosts.length - 1}
                  secondaryAction={
                    <IconButton component={Link} href={`/admin/posts/${post.id}/edit`} size="small">
                      <Edit fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemAvatar>
                    <Avatar
                      sx={{
                        bgcolor: (theme) =>
                          alpha(
                            post.status === 'published'
                              ? theme.palette.success.main
                              : theme.palette.warning.main,
                            0.1
                          ),
                      }}
                    >
                      {post.status === 'published' ? (
                        <Article sx={{ color: 'success.main' }} />
                      ) : (
                        <Schedule sx={{ color: 'warning.main' }} />
                      )}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        component="span"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}
                      >
                        {post.title}
                      </Typography>
                    }
                    secondary={
                      <Box
                        component="span"
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}
                      >
                        <Chip
                          label={post.status}
                          size="small"
                          color={post.status === 'published' ? 'success' : 'warning'}
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                        <Typography variant="caption" color="text.secondary" component="span">
                          {post.publishedAt
                            ? format(new Date(post.publishedAt), 'MMM d, yyyy')
                            : `Created ${formatDistanceToNow(new Date(post.createdAt))} ago`}
                        </Typography>
                      </Box>
                    }
                    primaryTypographyProps={{ component: 'div' }}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItem>
              ))}
            </List>
            <Box sx={{ p: 2, pt: 0 }}>
              <Button component={Link} href="/admin/posts/new" variant="outlined" fullWidth>
                Create New Post
              </Button>
            </Box>
          </Card>
        </Grid>

        {/* Recent Messages */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ pb: 0, p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2,
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Typography
                  variant="h6"
                  fontWeight={600}
                  sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
                >
                  Recent Messages
                </Typography>
                <Button
                  component={Link}
                  href="/admin/inbox"
                  endIcon={<ArrowForward />}
                  size="small"
                >
                  View All
                </Button>
              </Box>
              <Divider />
            </CardContent>
            <List>
              {data.recentMessages.map((message, index) => (
                <ListItem
                  key={message.id}
                  divider={index < data.recentMessages.length - 1}
                  sx={{
                    bgcolor:
                      message.status === 'unread'
                        ? (theme) => alpha(theme.palette.primary.main, 0.04)
                        : 'transparent',
                  }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      {(message.name || message.email || 'U').charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box
                        component="span"
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}
                      >
                        <Typography
                          variant="body2"
                          fontWeight={message.status !== 'unread' ? 400 : 600}
                          component="span"
                          sx={{
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {message.subject || '(No subject)'}
                        </Typography>
                        {message.status === 'unread' && (
                          <Box
                            component="span"
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: 'primary.main',
                              flexShrink: 0,
                              display: 'inline-block',
                            }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box
                        component="span"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mt: 0.5,
                          flexWrap: 'nowrap',
                          overflow: 'hidden',
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="span"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 1,
                            minWidth: 0,
                          }}
                        >
                          From: {message.name || message.email || 'Unknown'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="span"
                          sx={{ flexShrink: 0 }}
                        >
                          • {formatDistanceToNow(new Date(message.createdAt))} ago
                        </Typography>
                      </Box>
                    }
                    primaryTypographyProps={{ component: 'div' }}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItem>
              ))}
            </List>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Quick Actions
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Button
              component={Link}
              href="/admin/posts/new"
              variant="outlined"
              fullWidth
              startIcon={<Edit />}
              sx={{ py: 2, justifyContent: 'flex-start' }}
            >
              Write New Post
            </Button>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Button
              component={Link}
              href="/admin/inbox"
              variant="outlined"
              fullWidth
              startIcon={<Email />}
              sx={{ py: 2, justifyContent: 'flex-start' }}
            >
              Check Messages
            </Button>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Button
              component={Link}
              href="/admin/media"
              variant="outlined"
              fullWidth
              startIcon={<CalendarToday />}
              sx={{ py: 2, justifyContent: 'flex-start' }}
            >
              Schedule Content
            </Button>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Button
              component={Link}
              href="/"
              target="_blank"
              variant="outlined"
              fullWidth
              startIcon={<Visibility />}
              sx={{ py: 2, justifyContent: 'flex-start' }}
            >
              View Live Site
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
