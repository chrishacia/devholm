'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from '@/components/common/Link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Grid2 as Grid,
  Stack,
  Switch,
  Typography,
} from '@mui/material';

interface PluginAdminSurface {
  href: string;
  label?: string;
}

interface PluginCapabilities {
  admin: boolean;
  api: boolean;
  publicRoutes: boolean;
  navigation: boolean;
  sitemap: boolean;
  embeds: boolean;
}

interface PluginRecord {
  id: string;
  name: string;
  description: string | null;
  source: 'core' | 'user';
  enabledByDefault: boolean;
  adminSurface: PluginAdminSurface | null;
  capabilities: PluginCapabilities;
  isEnabled: boolean;
  updatedAt: string | null;
}

function capabilityLabels(capabilities: PluginCapabilities) {
  return [
    capabilities.admin ? 'Admin' : null,
    capabilities.api ? 'API' : null,
    capabilities.publicRoutes ? 'Public Routes' : null,
    capabilities.navigation ? 'Navigation' : null,
    capabilities.sitemap ? 'Sitemap' : null,
    capabilities.embeds ? 'Embeds' : null,
  ].filter((value): value is string => Boolean(value));
}

export default function AdminPluginsPage() {
  const [plugins, setPlugins] = useState<PluginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/plugins');
      if (!response.ok) {
        throw new Error('Failed to fetch plugins');
      }

      const result = await response.json();
      setPlugins(result.plugins || []);
    } catch (err) {
      console.error('Failed to load plugins:', err);
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const togglePlugin = useCallback(async (plugin: PluginRecord) => {
    setPendingPluginId(plugin.id);
    setError(null);

    try {
      const response = await fetch('/api/admin/plugins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: plugin.id, isEnabled: !plugin.isEnabled }),
      });

      if (!response.ok) {
        throw new Error('Failed to update plugin');
      }

      const result = await response.json();
      setPlugins(result.plugins || []);
    } catch (err) {
      console.error('Failed to toggle plugin:', err);
      setError(err instanceof Error ? err.message : 'Failed to update plugin');
    } finally {
      setPendingPluginId(null);
    }
  }, []);

  return (
    <Box>
      <Stack spacing={1.5} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={800}>
          Plugin Management
        </Typography>
        <Typography color="text.secondary">
          Plugin code is discovered at build time from core and tenant-owned extensions. Runtime
          enablement is managed here, and disabled plugins are removed from framework-managed public
          surfaces.
        </Typography>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {plugins.map((plugin) => {
            const capabilities = capabilityLabels(plugin.capabilities);
            const isPending = pendingPluginId === plugin.id;

            return (
              <Grid key={plugin.id} size={{ xs: 12, md: 6 }}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      spacing={2}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={700}>
                          {plugin.name}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5 }}>
                          <Chip
                            size="small"
                            label={plugin.source === 'core' ? 'Core' : 'Tenant'}
                            color={plugin.source === 'core' ? 'primary' : 'default'}
                          />
                          <Chip
                            size="small"
                            label={plugin.isEnabled ? 'Enabled' : 'Disabled'}
                            color={plugin.isEnabled ? 'success' : 'default'}
                          />
                        </Stack>
                      </Box>
                      <Switch
                        checked={plugin.isEnabled}
                        disabled={isPending}
                        onChange={() => {
                          void togglePlugin(plugin);
                        }}
                        inputProps={{ 'aria-label': `Toggle ${plugin.name}` }}
                      />
                    </Stack>

                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                      {plugin.description || 'No description provided.'}
                    </Typography>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {capabilities.length > 0 ? (
                        capabilities.map((capability) => (
                          <Chip
                            key={capability}
                            size="small"
                            variant="outlined"
                            label={capability}
                          />
                        ))
                      ) : (
                        <Chip size="small" variant="outlined" label="No declared capabilities" />
                      )}
                    </Stack>
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      {plugin.updatedAt
                        ? `Updated ${new Date(plugin.updatedAt).toLocaleString()}`
                        : `Default: ${plugin.enabledByDefault ? 'enabled' : 'disabled'}`}
                    </Typography>
                    {plugin.adminSurface ? (
                      <Button component={Link} href={plugin.adminSurface.href} size="small">
                        {plugin.adminSurface.label || 'Open settings'}
                      </Button>
                    ) : null}
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
