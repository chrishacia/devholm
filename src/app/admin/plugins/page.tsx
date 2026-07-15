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
  sourceResolution: {
    configuredSourceKind: string;
    resolvedSourceKind: string | null;
    localOverrideEnabled: boolean;
    localOverrideFilesystemPath: string | null;
    resolverFailureCodes: string[];
    diagnostics: {
      hasErrors: boolean;
      errorCount: number;
    };
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

interface MarketplaceCacheHealthSummary {
  generatedAt: string;
  usageBytes: number;
  usageEntries: number;
  pinnedUsageBytes: number;
  pinnedEntries: number;
  evictableUsageBytes: number;
  evictableEntries: number;
  mirrors: {
    total: number;
    enabled: number;
    degraded: number;
  };
  audits: {
    latestRunId: string | null;
    latestStatus: string | null;
    latestCompletedAt: string | null;
  };
  degraded: {
    overQuota: boolean;
    mirrorsDegraded: boolean;
    latestAuditDegraded: boolean;
  };
  policy: {
    maxCacheBytes: number;
  };
}

interface MarketplaceMirrorSummary {
  mirrorId: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  healthState: string;
  metadata?: {
    scope?: string;
  };
}

interface MarketplaceCleanupCandidate {
  cacheKey: string;
  sizeBytes: number;
  reasonCodes: string[];
  selected: boolean;
}

interface MarketplaceCleanupPlan {
  selectedBytes: number;
  selectedEntries: number;
  evictableBytes: number;
  evictableEntries: number;
  candidates: MarketplaceCleanupCandidate[];
}

interface MarketplaceMirrorEditorModel {
  mirrorId: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  scope: string;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }

  const rounded = amount >= 100 ? amount.toFixed(0) : amount.toFixed(1);
  return `${rounded} ${units[index]}`;
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

function mirrorToEditorModel(mirror: MarketplaceMirrorSummary): MarketplaceMirrorEditorModel {
  return {
    mirrorId: mirror.mirrorId,
    baseUrl: mirror.baseUrl,
    enabled: mirror.enabled,
    priority: mirror.priority,
    scope: mirror.metadata?.scope || 'global',
  };
}

export default function AdminPluginsPage() {
  const [plugins, setPlugins] = useState<MarketplacePluginView[]>([]);
  const [cacheHealth, setCacheHealth] = useState<MarketplaceCacheHealthSummary | null>(null);
  const [mirrors, setMirrors] = useState<MarketplaceMirrorSummary[]>([]);
  const [mirrorDraft, setMirrorDraft] = useState<MarketplaceMirrorEditorModel>({
    mirrorId: '',
    baseUrl: '',
    enabled: true,
    priority: 100,
    scope: 'global',
  });
  const [mirrorEdits, setMirrorEdits] = useState<Record<string, MarketplaceMirrorEditorModel>>({});
  const [cleanupPlan, setCleanupPlan] = useState<MarketplaceCleanupPlan | null>(null);
  const [auditStatus, setAuditStatus] = useState<string | null>(null);
  const [cacheActionPending, setCacheActionPending] = useState<
    'audit' | 'dry-run' | 'execute' | null
  >(null);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
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

  const fetchCacheAdministration = useCallback(async () => {
    try {
      const [healthResponse, mirrorsResponse] = await Promise.all([
        fetch('/api/admin/plugins/marketplace/cache-health'),
        fetch('/api/admin/plugins/marketplace/mirrors'),
      ]);

      if (healthResponse.ok) {
        const healthPayload = await healthResponse.json();
        setCacheHealth((healthPayload.summary || null) as MarketplaceCacheHealthSummary | null);
      }

      if (mirrorsResponse.ok) {
        const mirrorsPayload = await mirrorsResponse.json();
        const loadedMirrors = (mirrorsPayload.mirrors || []) as MarketplaceMirrorSummary[];
        setMirrors(loadedMirrors);
        setMirrorEdits((previous) => {
          const next: Record<string, MarketplaceMirrorEditorModel> = {};
          for (const mirror of loadedMirrors) {
            next[mirror.mirrorId] = previous[mirror.mirrorId] ?? mirrorToEditorModel(mirror);
          }
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to load marketplace cache administration state:', err);
    }
  }, []);

  useEffect(() => {
    fetchPlugins();
    fetchCacheAdministration();
  }, [fetchPlugins, fetchCacheAdministration]);

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

  const requestCleanupDryRun = useCallback(async () => {
    setCacheActionPending('dry-run');
    setError(null);
    try {
      const response = await fetch('/api/admin/plugins/marketplace/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'dry-run', limit: 25 }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate cleanup dry-run plan');
      }

      const payload = await response.json();
      setCleanupPlan((payload.plan || null) as MarketplaceCleanupPlan | null);
      await fetchCacheAdministration();
    } catch (err) {
      console.error('Failed to run cleanup dry-run:', err);
      setError(err instanceof Error ? err.message : 'Failed to run cleanup dry-run');
    } finally {
      setCacheActionPending(null);
    }
  }, [fetchCacheAdministration]);

  const requestIntegrityAudit = useCallback(async () => {
    setCacheActionPending('audit');
    setError(null);
    try {
      const response = await fetch('/api/admin/plugins/marketplace/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'start' }),
      });

      if (!response.ok) {
        throw new Error('Failed to run integrity audit');
      }

      const payload = await response.json();
      setAuditStatus(payload.run?.status || 'unknown');
      await fetchCacheAdministration();
    } catch (err) {
      console.error('Failed to run integrity audit:', err);
      setError(err instanceof Error ? err.message : 'Failed to run integrity audit');
    } finally {
      setCacheActionPending(null);
    }
  }, [fetchCacheAdministration]);

  const requestCleanupExecute = useCallback(async () => {
    setCacheActionPending('execute');
    setError(null);
    try {
      const response = await fetch('/api/admin/plugins/marketplace/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'execute',
          limit: 25,
          confirmation: 'execute-cleanup',
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to execute cleanup');
      }

      const payload = await response.json();
      setCleanupPlan((payload.plan || null) as MarketplaceCleanupPlan | null);
      await fetchCacheAdministration();
    } catch (err) {
      console.error('Failed to execute cleanup:', err);
      setError(err instanceof Error ? err.message : 'Failed to execute cleanup');
    } finally {
      setCacheActionPending(null);
      setCleanupConfirmOpen(false);
    }
  }, [fetchCacheAdministration]);

  const saveMirror = useCallback(
    async (payload: MarketplaceMirrorEditorModel, method: 'POST' | 'PATCH') => {
      setError(null);
      try {
        const response = await fetch('/api/admin/plugins/marketplace/mirrors', {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mirrorId: payload.mirrorId,
            baseUrl: payload.baseUrl,
            enabled: payload.enabled,
            priority: payload.priority,
            metadata: {
              scope: payload.scope,
            },
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || 'Failed to save mirror');
        }

        await fetchCacheAdministration();
      } catch (err) {
        console.error('Failed to save mirror:', err);
        setError(err instanceof Error ? err.message : 'Failed to save mirror');
      }
    },
    [fetchCacheAdministration]
  );

  const createMirror = useCallback(async () => {
    if (!mirrorDraft.mirrorId.trim() || !mirrorDraft.baseUrl.trim()) {
      setError('Mirror ID and base URL are required');
      return;
    }

    await saveMirror(mirrorDraft, 'POST');
    setMirrorDraft({
      mirrorId: '',
      baseUrl: '',
      enabled: true,
      priority: 100,
      scope: 'global',
    });
  }, [mirrorDraft, saveMirror]);

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

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Cache Usage
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {cacheHealth
                  ? `${formatBytes(cacheHealth.usageBytes)} / ${formatBytes(cacheHealth.policy.maxCacheBytes)}`
                  : 'Unknown'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Pinned {cacheHealth ? formatBytes(cacheHealth.pinnedUsageBytes) : 'Unknown'} •
                Evictable {cacheHealth ? formatBytes(cacheHealth.evictableUsageBytes) : 'Unknown'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Cache Health
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  label={cacheHealth?.degraded.overQuota ? 'Over quota' : 'Quota healthy'}
                  color={cacheHealth?.degraded.overQuota ? 'warning' : 'success'}
                />
                <Chip
                  size="small"
                  label={
                    cacheHealth?.degraded.latestAuditDegraded ? 'Audit degraded' : 'Audit healthy'
                  }
                  color={cacheHealth?.degraded.latestAuditDegraded ? 'warning' : 'success'}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Entries: {cacheHealth?.usageEntries ?? 'Unknown'} • Pinned:{' '}
                {cacheHealth?.pinnedEntries ?? 'Unknown'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Mirrors
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {cacheHealth
                  ? `${cacheHealth.mirrors.enabled}/${cacheHealth.mirrors.total}`
                  : 'Unknown'}{' '}
                enabled
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Degraded: {cacheHealth?.mirrors.degraded ?? 'Unknown'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Offline Readiness
              </Typography>
              <Chip
                size="small"
                label={
                  cacheHealth && cacheHealth.evictableEntries === 0
                    ? 'Protected cache only'
                    : 'Review readiness'
                }
                color={cacheHealth && cacheHealth.evictableEntries === 0 ? 'success' : 'warning'}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Last audit:{' '}
                {cacheHealth?.audits.latestCompletedAt
                  ? new Date(cacheHealth.audits.latestCompletedAt).toLocaleString()
                  : 'No audit completed'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Cache Operations
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Generate deterministic cleanup plans and run integrity audits without destructive
                defaults.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                disabled={cacheActionPending !== null}
                onClick={() => {
                  void requestCleanupDryRun();
                }}
              >
                {cacheActionPending === 'dry-run' ? 'Planning…' : 'Dry-run cleanup'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={cacheActionPending !== null}
                onClick={() => {
                  setCleanupConfirmOpen(true);
                }}
              >
                {cacheActionPending === 'execute' ? 'Executing…' : 'Execute cleanup'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={cacheActionPending !== null}
                onClick={() => {
                  void requestIntegrityAudit();
                }}
              >
                {cacheActionPending === 'audit' ? 'Auditing…' : 'Run integrity audit'}
              </Button>
            </Stack>
          </Stack>

          {cleanupPlan ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Dry-run selected {cleanupPlan.selectedEntries} artifact(s) reclaiming{' '}
              {formatBytes(cleanupPlan.selectedBytes)}. Evictable total:{' '}
              {cleanupPlan.evictableEntries} artifact(s) / {formatBytes(cleanupPlan.evictableBytes)}
              .
            </Alert>
          ) : null}

          {cleanupPlan && cleanupPlan.candidates.length > 0 ? (
            <List dense sx={{ mt: 1 }}>
              {cleanupPlan.candidates.slice(0, 8).map((candidate) => (
                <ListItem key={candidate.cacheKey}>
                  <ListItemText
                    primary={`${candidate.cacheKey} • ${formatBytes(candidate.sizeBytes)} • ${candidate.selected ? 'selected' : 'retained'}`}
                    secondary={candidate.reasonCodes.join(', ') || 'no reason code'}
                  />
                </ListItem>
              ))}
            </List>
          ) : null}

          {auditStatus ? (
            <Alert severity={auditStatus === 'succeeded' ? 'success' : 'warning'} sx={{ mt: 2 }}>
              Latest audit request completed with status: {auditStatus}.
            </Alert>
          ) : null}

          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Mirror Administration
          </Typography>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            {mirrors.map((mirror) => {
              const edit = mirrorEdits[mirror.mirrorId] ?? mirrorToEditorModel(mirror);
              return (
                <Stack
                  key={mirror.mirrorId}
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'stretch', md: 'center' }}
                >
                  <TextField
                    size="small"
                    label="Mirror ID"
                    value={edit.mirrorId}
                    disabled
                    sx={{ minWidth: 160 }}
                  />
                  <TextField
                    size="small"
                    label="Base URL"
                    value={edit.baseUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMirrorEdits((previous) => ({
                        ...previous,
                        [mirror.mirrorId]: { ...edit, baseUrl: value },
                      }));
                    }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Priority"
                    type="number"
                    value={edit.priority}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      setMirrorEdits((previous) => ({
                        ...previous,
                        [mirror.mirrorId]: {
                          ...edit,
                          priority: Number.isFinite(value) ? value : edit.priority,
                        },
                      }));
                    }}
                    sx={{ width: 120 }}
                  />
                  <TextField
                    size="small"
                    label="Scope"
                    value={edit.scope}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMirrorEdits((previous) => ({
                        ...previous,
                        [mirror.mirrorId]: { ...edit, scope: value },
                      }));
                    }}
                    sx={{ width: 150 }}
                  />
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      Enabled
                    </Typography>
                    <Switch
                      checked={edit.enabled}
                      onChange={(event) => {
                        setMirrorEdits((previous) => ({
                          ...previous,
                          [mirror.mirrorId]: { ...edit, enabled: event.target.checked },
                        }));
                      }}
                    />
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      void saveMirror(edit, 'PATCH');
                    }}
                  >
                    Save
                  </Button>
                  <Chip
                    size="small"
                    label={mirror.healthState}
                    color={
                      mirror.enabled &&
                      (mirror.healthState === 'healthy' || mirror.healthState === 'unknown')
                        ? 'success'
                        : 'warning'
                    }
                  />
                </Stack>
              );
            })}

            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1}
              alignItems={{ xs: 'stretch', md: 'center' }}
            >
              <TextField
                size="small"
                label="New mirror ID"
                value={mirrorDraft.mirrorId}
                onChange={(event) => {
                  setMirrorDraft((previous) => ({ ...previous, mirrorId: event.target.value }));
                }}
                sx={{ minWidth: 180 }}
              />
              <TextField
                size="small"
                label="New mirror base URL"
                value={mirrorDraft.baseUrl}
                onChange={(event) => {
                  setMirrorDraft((previous) => ({ ...previous, baseUrl: event.target.value }));
                }}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Priority"
                type="number"
                value={mirrorDraft.priority}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setMirrorDraft((previous) => ({
                    ...previous,
                    priority: Number.isFinite(value) ? value : previous.priority,
                  }));
                }}
                sx={{ width: 120 }}
              />
              <TextField
                size="small"
                label="Scope"
                value={mirrorDraft.scope}
                onChange={(event) => {
                  setMirrorDraft((previous) => ({ ...previous, scope: event.target.value }));
                }}
                sx={{ width: 140 }}
              />
              <Button
                size="small"
                variant="contained"
                onClick={() => {
                  void createMirror();
                }}
              >
                Add mirror
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

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
                      <Chip
                        size="small"
                        variant="outlined"
                        color={entry.sourceResolution.localOverrideEnabled ? 'info' : 'default'}
                        label={
                          entry.sourceResolution.localOverrideEnabled
                            ? 'Source: Local Override'
                            : 'Source: Bundled Default'
                        }
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Resolved source: ${entry.sourceResolution.resolvedSourceKind || 'unresolved'}`}
                      />
                    </Stack>

                    {entry.sourceResolution.resolverFailureCodes.length > 0 ? (
                      <Alert severity="error" sx={{ mt: 2 }}>
                        Source resolution failed:{' '}
                        {entry.sourceResolution.resolverFailureCodes.join(', ')}
                      </Alert>
                    ) : null}

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
                <Chip
                  size="small"
                  label={`Configured source: ${selectedPlugin.sourceResolution.configuredSourceKind}`}
                />
                <Chip
                  size="small"
                  label={`Resolved source: ${selectedPlugin.sourceResolution.resolvedSourceKind || 'unresolved'}`}
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
                <ListItem>
                  <ListItemText
                    primary="Development source"
                    secondary={
                      selectedPlugin.sourceResolution.localOverrideEnabled
                        ? `Local override active at ${selectedPlugin.sourceResolution.localOverrideFilesystemPath || 'unknown path'}`
                        : 'Using bundled default source configuration'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Resolver diagnostics"
                    secondary={
                      selectedPlugin.sourceResolution.resolverFailureCodes.length > 0
                        ? selectedPlugin.sourceResolution.resolverFailureCodes.join(', ')
                        : selectedPlugin.sourceResolution.diagnostics.hasErrors
                          ? `Global source diagnostics present (${selectedPlugin.sourceResolution.diagnostics.errorCount} error(s))`
                          : 'No source resolution errors detected'
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

      <Dialog
        open={cleanupConfirmOpen}
        onClose={() => setCleanupConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirm cleanup execution</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <Typography color="text.secondary">
              This deletes eligible cache entries after a fresh pin recheck. Protected artifacts
              remain retained.
            </Typography>
            <Alert severity="warning">
              Proceed only when rollback and recovery pins are current.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCleanupConfirmOpen(false)}>Cancel</Button>
          <Button
            color="warning"
            variant="contained"
            disabled={cacheActionPending !== null}
            onClick={() => {
              void requestCleanupExecute();
            }}
          >
            {cacheActionPending === 'execute' ? 'Executing…' : 'Execute cleanup'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
