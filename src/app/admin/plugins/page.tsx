'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from '@/components/common/Link';
import {
  deriveMarketplaceUiState,
  getMarketplaceUiStateDefinition,
} from '@/app/admin/plugins/marketplace-state';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid2 as Grid,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Switch,
  TextField,
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
  installed: boolean;
  installedVersion: string | null;
  bundledVersion: string | null;
  lifecycleState: 'bundled' | 'installed' | 'disabled' | 'uninstalled';
  operationStatus: string;
  updatedAt: string | null;
}

interface MarketplacePluginView {
  plugin: PluginRecord;
  catalogEntry: {
    pluginId: string;
    pluginSubdirectory: string;
    manifestPath: string;
    version: string;
    runtimeInstallSupported: boolean;
    installReadiness: string;
    source: {
      repositoryUrl: string;
      ref: string;
    };
    publisher: {
      publisherId: string;
      classification: string;
    };
  };
  capabilities: {
    permissionKeys: string[];
    capabilities: string[];
    scopes: string[];
  };
  lifecycle: {
    hasAfterInstall: boolean;
    hasAfterUpgrade: boolean;
    hasBeforeDisable: boolean;
    hasBeforeUninstall: boolean;
    hasPurge: boolean;
    disablePolicy?: 'non-destructive';
    uninstallPolicy?: 'non-destructive';
    dataRetention?: string;
  };
  migration: {
    migrationCount: number;
    policy: 'none' | 'declared' | 'baseline-adoption';
    destructiveDataWipe: 'blocked' | 'allowed-with-confirmation' | 'unknown';
  };
  signature: {
    decision: 'trusted' | 'blocked' | 'untrusted';
    status: string;
    keyId: string | null;
    notes: string[];
  };
  trustPolicy: {
    outcome: 'allow' | 'deny' | 'unknown';
    reasonCode: string;
  };
  operation: {
    hasActive: boolean;
    status: string | null;
    stage: string | null;
    operationId: string | null;
    updatedAt: string | null;
    recoveryRequired: boolean;
  };
  history: Array<{
    fromVersion: string;
    toVersion: string;
    status: 'success' | 'failed' | 'rolled_back';
    appliedAt: string;
    rollbackAvailableUntil?: string;
  }>;
  actions: {
    install: { allowed: boolean; reasonCode: string | null; remediation: string };
    update: { allowed: boolean; reasonCode: string | null; remediation: string };
    rollback: { allowed: boolean; reasonCode: string | null; remediation: string };
    enable: { allowed: boolean; reasonCode: string | null; remediation: string };
    disable: { allowed: boolean; reasonCode: string | null; remediation: string };
  };
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
  const [plugins, setPlugins] = useState<MarketplacePluginView[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'installed' | 'not-installed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [installDialogPluginId, setInstallDialogPluginId] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/plugins/marketplace/catalog');
      if (!response.ok) {
        throw new Error('Failed to fetch marketplace plugins');
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

  useEffect(() => {
    const hasInProgress = plugins.some((entry) => entry.operation.hasActive);
    if (!hasInProgress) {
      return;
    }

    const timer = setInterval(() => {
      void fetchPlugins();
    }, 3000);

    return () => clearInterval(timer);
  }, [plugins, fetchPlugins]);

  const togglePlugin = useCallback(
    async (plugin: MarketplacePluginView) => {
      setPendingPluginId(plugin.plugin.id);
      setError(null);

      try {
        const response = await fetch('/api/admin/plugins', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginId: plugin.plugin.id, isEnabled: !plugin.plugin.isEnabled }),
        });

        if (!response.ok) {
          throw new Error('Failed to update plugin');
        }

        await fetchPlugins();
      } catch (err) {
        console.error('Failed to toggle plugin:', err);
        setError(err instanceof Error ? err.message : 'Failed to update plugin');
      } finally {
        setPendingPluginId(null);
      }
    },
    [fetchPlugins]
  );

  const submitInstall = useCallback(
    async (plugin: MarketplacePluginView) => {
      setPendingPluginId(plugin.plugin.id);
      setError(null);

      try {
        const response = await fetch('/api/admin/plugins/marketplace/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descriptor: {
              sourceType: 'marketplace',
              repoUrl: plugin.catalogEntry.source.repositoryUrl,
              ref: plugin.catalogEntry.source.ref,
              pluginSubdirectory: plugin.catalogEntry.pluginSubdirectory,
              manifestPath: plugin.catalogEntry.manifestPath,
              expectedPluginId: plugin.catalogEntry.pluginId,
              expectedVersion: plugin.catalogEntry.version,
            },
            catalogEntry: plugin.catalogEntry,
            explicitAdminApproval: true,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || 'Failed to install plugin');
        }

        setInstallDialogPluginId(null);
        await fetchPlugins();
      } catch (err) {
        console.error('Failed to install plugin:', err);
        setError(err instanceof Error ? err.message : 'Failed to install plugin');
      } finally {
        setPendingPluginId(null);
      }
    },
    [fetchPlugins]
  );

  const filteredPlugins = plugins.filter((entry) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'installed' ? entry.plugin.installed : !entry.plugin.installed);
    if (!matchesStatus) {
      return false;
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    const fields = [
      entry.plugin.name,
      entry.plugin.id,
      entry.plugin.description || '',
      entry.catalogEntry.publisher.publisherId,
      entry.catalogEntry.publisher.classification,
    ];
    return fields.some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  const selectedPlugin = selectedPluginId
    ? plugins.find((entry) => entry.plugin.id === selectedPluginId) || null
    : null;

  return (
    <Box>
      <Stack spacing={1.5} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={800}>
          Marketplace Plugin Management
        </Typography>
        <Typography color="text.secondary">
          Discover bundled marketplace plugins, inspect trust and signature evidence, and run
          install and lifecycle actions with durable operation-state visibility.
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Autocomplete
          freeSolo
          options={plugins.map((entry) => entry.plugin.name)}
          inputValue={query}
          onInputChange={(_, value) => setQuery(value)}
          renderInput={(params) => <TextField {...params} label="Search plugins" size="small" />}
          sx={{ minWidth: 280, flex: 1 }}
        />
        <Select
          size="small"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as 'all' | 'installed' | 'not-installed');
          }}
          sx={{ width: { xs: '100%', md: 220 } }}
        >
          <MenuItem value="all">All plugins</MenuItem>
          <MenuItem value="installed">Installed</MenuItem>
          <MenuItem value="not-installed">Not installed</MenuItem>
        </Select>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Stack spacing={2} sx={{ py: 2 }}>
          <Skeleton variant="rounded" height={110} />
          <Skeleton variant="rounded" height={110} />
          <Skeleton variant="rounded" height={110} />
        </Stack>
      ) : (
        <Grid container spacing={3}>
          {filteredPlugins.map((entry) => {
            const plugin = entry.plugin;
            const capabilities = capabilityLabels(plugin.capabilities);
            const isPending = pendingPluginId === plugin.id;
            const uiState = deriveMarketplaceUiState({
              installed: plugin.installed,
              enabled: plugin.isEnabled,
              operationStatus: entry.operation.status,
              signatureDecision: entry.signature.decision,
              trustOutcome: entry.trustPolicy.outcome,
              trustReasonCode: entry.trustPolicy.reasonCode,
              recoveryRequired: entry.operation.recoveryRequired,
            });
            const uiStateDef = getMarketplaceUiStateDefinition(uiState);

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
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ mt: 1, mb: 1.5 }}
                          useFlexGap
                          flexWrap="wrap"
                        >
                          <Chip
                            size="small"
                            label={plugin.source === 'core' ? 'Core' : 'Tenant'}
                            color={plugin.source === 'core' ? 'primary' : 'default'}
                          />
                          <Chip
                            size="small"
                            label={plugin.installed ? 'Installed' : 'Not installed'}
                            color={plugin.installed ? 'success' : 'default'}
                          />
                          <Chip
                            size="small"
                            label={plugin.isEnabled ? 'Enabled' : 'Disabled'}
                            color={plugin.isEnabled ? 'success' : 'default'}
                          />
                          <Chip size="small" label={uiStateDef.label} />
                        </Stack>
                      </Box>
                      <Switch
                        checked={plugin.isEnabled}
                        disabled={isPending || (!entry.actions.enable.allowed && !plugin.isEnabled)}
                        onChange={() => {
                          void togglePlugin(entry);
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

                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={entry.signature.decision === 'trusted' ? 'success' : 'warning'}
                        label={`Signature: ${entry.signature.status}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        color={entry.trustPolicy.outcome === 'allow' ? 'success' : 'warning'}
                        label={`Trust: ${entry.trustPolicy.reasonCode}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Publisher: ${entry.catalogEntry.publisher.classification}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Available: ${entry.catalogEntry.version}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Installed: ${entry.plugin.installedVersion || 'none'}`}
                      />
                    </Stack>

                    {!entry.actions.install.allowed && !plugin.installed ? (
                      <Alert severity="warning" sx={{ mt: 2 }}>
                        Install blocked: {entry.actions.install.reasonCode}.{' '}
                        {entry.actions.install.remediation}
                      </Alert>
                    ) : null}

                    {entry.operation.hasActive ? (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        Operation in progress: {entry.operation.stage || 'unknown stage'} (status:{' '}
                        {entry.operation.status || 'unknown'}).
                      </Alert>
                    ) : null}
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      {plugin.updatedAt
                        ? `Updated ${new Date(plugin.updatedAt).toLocaleString()}`
                        : `Default: ${plugin.enabledByDefault ? 'enabled' : 'disabled'} • ${uiStateDef.reason}`}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        onClick={() => setSelectedPluginId(plugin.id)}
                        aria-label={`Inspect ${plugin.name}`}
                      >
                        Inspect
                      </Button>
                      {!plugin.installed ? (
                        <Button
                          size="small"
                          disabled={!entry.actions.install.allowed || isPending}
                          onClick={() => setInstallDialogPluginId(plugin.id)}
                        >
                          Install
                        </Button>
                      ) : null}
                      {plugin.adminSurface ? (
                        <Button component={Link} href={plugin.adminSurface.href} size="small">
                          {plugin.adminSurface.label || 'Open settings'}
                        </Button>
                      ) : null}
                    </Stack>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
          {filteredPlugins.length === 0 ? (
            <Grid size={{ xs: 12 }}>
              <Alert severity="info">
                No plugins matched your filters. Clear search or switch status filter.
              </Alert>
            </Grid>
          ) : null}
        </Grid>
      )}

      {selectedPlugin ? (
        <Dialog
          open
          onClose={() => setSelectedPluginId(null)}
          fullWidth
          maxWidth="md"
          disableScrollLock
          disablePortal
        >
          <DialogTitle>{selectedPlugin.plugin.name || 'Plugin detail'}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography color="text.secondary">
                {selectedPlugin.plugin.description || 'No description provided.'}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip size="small" label={`Plugin ID: ${selectedPlugin.plugin.id}`} />
                <Chip
                  size="small"
                  label={`Publisher: ${selectedPlugin.catalogEntry.publisher.publisherId}`}
                />
                <Chip
                  size="small"
                  label={`Publisher class: ${selectedPlugin.catalogEntry.publisher.classification}`}
                />
                <Chip size="small" label={`Signature: ${selectedPlugin.signature.status}`} />
                <Chip size="small" label={`Trust: ${selectedPlugin.trustPolicy.reasonCode}`} />
                <Chip
                  size="small"
                  label={`Install readiness: ${selectedPlugin.catalogEntry.installReadiness}`}
                />
              </Stack>

              <Typography variant="subtitle2">Capabilities and lifecycle</Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Capabilities"
                    secondary={
                      selectedPlugin.capabilities.capabilities.length > 0
                        ? selectedPlugin.capabilities.capabilities.join(', ')
                        : 'No explicit capabilities declared'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Lifecycle hooks"
                    secondary={`afterInstall=${selectedPlugin.lifecycle.hasAfterInstall}, afterUpgrade=${selectedPlugin.lifecycle.hasAfterUpgrade}, beforeDisable=${selectedPlugin.lifecycle.hasBeforeDisable}, beforeUninstall=${selectedPlugin.lifecycle.hasBeforeUninstall}, purge=${selectedPlugin.lifecycle.hasPurge}`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Migration policy"
                    secondary={`count=${selectedPlugin.migration.migrationCount}, policy=${selectedPlugin.migration.policy}, destructiveDataWipe=${selectedPlugin.migration.destructiveDataWipe}`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Durable operation"
                    secondary={
                      selectedPlugin.operation.operationId
                        ? `${selectedPlugin.operation.operationId} (${selectedPlugin.operation.status}) stage=${selectedPlugin.operation.stage || 'n/a'}`
                        : 'No active durable operation'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Recovery"
                    secondary={
                      selectedPlugin.operation.recoveryRequired
                        ? 'Recovery required. Open Recovery Center to continue safely.'
                        : 'No recovery action required.'
                    }
                  />
                </ListItem>
              </List>

              <Typography variant="subtitle2">Operation history</Typography>
              {selectedPlugin.history.length > 0 ? (
                <List dense>
                  {selectedPlugin.history.map((entry, index) => (
                    <ListItem key={`${entry.appliedAt}-${index}`}>
                      <ListItemText
                        primary={`${entry.fromVersion} -> ${entry.toVersion} (${entry.status})`}
                        secondary={`Applied ${new Date(entry.appliedAt).toLocaleString()}${entry.rollbackAvailableUntil ? ` • rollback until ${new Date(entry.rollbackAvailableUntil).toLocaleString()}` : ''}`}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Alert severity="info">
                  No operation history is available yet for this plugin.
                </Alert>
              )}

              <Alert severity="info">
                Recovery Center: use Admin setup and operational recovery guidance for interrupted
                marketplace operations.
              </Alert>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedPluginId(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      ) : null}

      {installDialogPluginId
        ? (() => {
            const plugin = plugins.find((entry) => entry.plugin.id === installDialogPluginId);
            if (!plugin) {
              return null;
            }

            return (
              <Dialog
                open
                onClose={() => setInstallDialogPluginId(null)}
                fullWidth
                maxWidth="sm"
                disableScrollLock
                disablePortal
              >
                <DialogTitle>Confirm install: {plugin.plugin.name}</DialogTitle>
                <DialogContent dividers>
                  <Stack spacing={1.25}>
                    <Typography>
                      Plugin <strong>{plugin.plugin.id}</strong> version{' '}
                      <strong>{plugin.catalogEntry.version}</strong>
                    </Typography>
                    <Typography color="text.secondary">
                      Signature: {plugin.signature.status}. Trust: {plugin.trustPolicy.reasonCode}.
                    </Typography>
                    <Typography color="text.secondary">
                      Migrations: {plugin.migration.migrationCount}. Policy:{' '}
                      {plugin.migration.policy}.
                    </Typography>
                    <Typography color="text.secondary">
                      Data risk: destructiveDataWipe={plugin.migration.destructiveDataWipe}.
                    </Typography>
                    {!plugin.actions.install.allowed ? (
                      <Alert severity="warning">
                        Install blocked: {plugin.actions.install.reasonCode}.{' '}
                        {plugin.actions.install.remediation}
                      </Alert>
                    ) : null}
                  </Stack>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setInstallDialogPluginId(null)}>Cancel</Button>
                  <Button
                    variant="contained"
                    disabled={
                      !plugin.actions.install.allowed || pendingPluginId === plugin.plugin.id
                    }
                    onClick={() => {
                      void submitInstall(plugin);
                    }}
                  >
                    {pendingPluginId === plugin.plugin.id ? 'Installing…' : 'Confirm install'}
                  </Button>
                </DialogActions>
              </Dialog>
            );
          })()
        : null}
    </Box>
  );
}
