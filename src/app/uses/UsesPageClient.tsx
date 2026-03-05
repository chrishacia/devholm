'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Container,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  alpha,
  Skeleton,
} from '@mui/material';
import {
  Computer,
  Code,
  Brush,
  Terminal,
  Cloud,
  Chair,
  Build,
  Storage,
  Security,
  Speed,
  Psychology,
  Devices,
  Extension,
  ViewModule,
} from '@mui/icons-material';
import { AuthAwareMainLayout } from '@/components';

// Available icons mapping
const availableIcons: Record<string, React.ElementType> = {
  Computer,
  Code,
  Brush,
  Terminal,
  Cloud,
  Chair,
  Build,
  Storage,
  Security,
  Speed,
  Psychology,
  Devices,
  Extension,
  ViewModule,
};

interface UsesItem {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
}

interface UsesCategory {
  id: string;
  title: string;
  icon: string;
  items: UsesItem[];
}

function LoadingSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {[1, 2, 3, 4].map((i) => (
        <Paper key={i} sx={{ p: 3 }}>
          <Skeleton variant="text" width={200} height={32} sx={{ mb: 2 }} />
          <Skeleton variant="rectangular" height={150} />
        </Paper>
      ))}
    </Box>
  );
}

export default function UsesPage() {
  const [categories, setCategories] = useState<UsesCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/uses');
        if (!response.ok) throw new Error('Failed to fetch uses data');
        const data = await response.json();
        setCategories(data.categories || []);
      } catch (err) {
        console.error('Error fetching uses data:', err);
        setError('Failed to load uses data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <AuthAwareMainLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Uses
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            A comprehensive list of the tools, apps, and gear I use daily for development, design,
            and productivity. Inspired by{' '}
            <Box
              component="a"
              href="https://uses.tech"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'primary.main' }}
            >
              uses.tech
            </Box>
            .
          </Typography>
        </Box>

        {/* Categories */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="error">{error}</Typography>
          </Paper>
        ) : categories.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Build sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No items yet
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Check back soon for a list of tools and gear.
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mb: 6 }}>
            {categories.map((category) => {
              const IconComponent = availableIcons[category.icon] || Build;
              return (
                <Paper
                  key={category.id}
                  sx={{
                    p: 3,
                    overflow: 'hidden',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
                    <Box
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconComponent sx={{ fontSize: 20 }} />
                    </Box>
                    <Typography variant="h6" component="h2" fontWeight={600}>
                      {category.title}
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  <List disablePadding>
                    {category.items.map((item, itemIndex) => (
                      <ListItem
                        key={item.id}
                        sx={{
                          px: 0,
                          py: 1,
                          borderBottom: itemIndex < category.items.length - 1 ? 1 : 0,
                          borderColor: 'divider',
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Build sx={{ fontSize: 16, color: 'text.secondary' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            item.url ? (
                              <Box
                                component="a"
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                  color: 'inherit',
                                  textDecoration: 'none',
                                  '&:hover': { color: 'primary.main' },
                                }}
                              >
                                {item.name}
                              </Box>
                            ) : (
                              item.name
                            )
                          }
                          secondary={item.description}
                          primaryTypographyProps={{
                            fontWeight: 500,
                            fontSize: '0.9rem',
                          }}
                          secondaryTypographyProps={{
                            color: 'text.secondary',
                            fontSize: '0.8rem',
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* Note */}
        {categories.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              textAlign: 'center',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.secondary.dark, 0.1)
                  : alpha(theme.palette.secondary.light, 0.1),
            }}
          >
            <Typography variant="body1" color="text.secondary">
              <strong>Note:</strong> This page contains affiliate links where applicable. I only
              recommend products I actually use and believe in.
            </Typography>
          </Paper>
        )}
      </Container>
    </AuthAwareMainLayout>
  );
}
