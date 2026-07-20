'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from '@/components/common/Link';
import {
  derivePluginManagementPresentation,
  type PluginManagementPresentationInput,
} from '@/app/admin/plugins/presentation-model';
import type { PluginLifecycleActionAuthority } from '@core/lib/plugin-lifecycle-action-authority.server';
import type {
  CanonicalPluginStateAxes,
  CanonicalPluginSummaryState,
} from '@core/types/plugin-canonical-contracts';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

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
    leaseOwner: string | null;
    leaseExpiresAt: string | null;
    leaseExpired: boolean;
    recoveryRequired: boolean;
  };
  desiredLifecycleState: string;
  observedLifecycleState: string;
  reconciliation: {
    action: string;
    recoveryClassification:
      | 'none'
      | 'retryable'
      | 'recovery-required'
      | 'manual-intervention-required';
    message: string;
    remediation: string;
  };
  rollback: {
    eligible: boolean;
    reasonCode: string;
  };
  latestTransition: {
    eventId: string | null;
    transition: string | null;
    result: 'succeeded' | 'failed' | null;
    timestamp: string | null;
    errorCode: string | null;
  };
  migrationCheckpoint: {
    interrupted: boolean;
    interruptedMigrationId: string | null;
    interruptedDirection: 'up' | 'down' | null;
    completedCount: number;
    latestCompletedMigrationId: string | null;
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
  lifecycleState: {
    axes: CanonicalPluginStateAxes;
    summaryState: CanonicalPluginSummaryState;
    validationErrors: string[];
  };
  actionAuthority: PluginLifecycleActionAuthority;
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

function toPresentationInput(entry: MarketplacePluginView): PluginManagementPresentationInput {
  return {
    plugin: {
      name: entry.plugin.name,
      installed: entry.plugin.installed,
      isEnabled: entry.plugin.isEnabled,
      installedVersion: entry.plugin.installedVersion,
      bundledVersion: entry.plugin.bundledVersion,
    },
    lifecycleState: {
      axes: entry.lifecycleState.axes,
      summaryState: entry.lifecycleState.summaryState,
    },
    actionAuthority: entry.actionAuthority,
    sourceResolution: {
      configuredSourceKind: entry.sourceResolution.configuredSourceKind,
      resolvedSourceKind: entry.sourceResolution.resolvedSourceKind,
      localOverrideEnabled: entry.sourceResolution.localOverrideEnabled,
    },
    trustPolicy: {
      outcome: entry.trustPolicy.outcome,
      reasonCode: entry.trustPolicy.reasonCode,
    },
    reconciliation: {
      action: entry.reconciliation.action,
      message: entry.reconciliation.message,
      remediation: entry.reconciliation.remediation,
    },
    rollback: { eligible: entry.rollback.eligible },
    operation: {
      hasActive: entry.operation.hasActive,
      recoveryRequired: entry.operation.recoveryRequired,
    },
    catalogEntry: {
      version: entry.catalogEntry.version,
    },
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
  const [statusFilter, setStatusFilter] = useState<
    | 'all'
    | 'needs-attention'
    | 'active'
    | 'disabled'
    | 'pending'
    | 'updates'
    | 'blocked'
    | 'local-overrides'
  >('all');
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
    const presentation = derivePluginManagementPresentation(toPresentationInput(entry));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'needs-attention' &&
        (presentation.flags.recoveryRequired ||
          presentation.flags.degraded ||
          presentation.blockedActions.length > 0)) ||
      (statusFilter === 'active' && presentation.primaryStatus.id === 'active') ||
      (statusFilter === 'disabled' && presentation.primaryStatus.id === 'disabled') ||
      (statusFilter === 'pending' &&
        (presentation.flags.pendingBuild || presentation.flags.pendingDeployment)) ||
      (statusFilter === 'updates' && presentation.flags.updateAvailable) ||
      (statusFilter === 'blocked' && presentation.blockedActions.length > 0) ||
      (statusFilter === 'local-overrides' && presentation.flags.localOverride);

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
      presentation.primaryStatus.label,
      presentation.sourceLabel,
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
        <TextField
          select
          size="small"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as typeof statusFilter);
          }}
          label="Status"
          sx={{ width: { xs: '100%', md: 220 } }}
        >
          <MenuItem value="all">All plugins</MenuItem>
          <MenuItem value="needs-attention">Needs attention</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="disabled">Disabled</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="updates">Updates</MenuItem>
          <MenuItem value="blocked">Blocked</MenuItem>
          <MenuItem value="local-overrides">Local overrides</MenuItem>
        </TextField>
      </Stack>

      <Accordion sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Marketplace Infrastructure
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Cache health, cleanup, integrity audit, and mirror administration.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
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
                    Evictable{' '}
                    {cacheHealth ? formatBytes(cacheHealth.evictableUsageBytes) : 'Unknown'}
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
                        cacheHealth?.degraded.latestAuditDegraded
                          ? 'Audit degraded'
                          : 'Audit healthy'
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
                    color={
                      cacheHealth && cacheHealth.evictableEntries === 0 ? 'success' : 'warning'
                    }
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

          <Card variant="outlined" sx={{ mb: 1 }}>
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
                    Generate deterministic cleanup plans and run integrity audits without
                    destructive defaults.
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
                  {cleanupPlan.evictableEntries} artifact(s) /{' '}
                  {formatBytes(cleanupPlan.evictableBytes)}.
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
                <Alert
                  severity={auditStatus === 'succeeded' ? 'success' : 'warning'}
                  sx={{ mt: 2 }}
                >
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
        </AccordionDetails>
      </Accordion>

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
            const presentation = derivePluginManagementPresentation(toPresentationInput(entry));
            const installAction = entry.actionAuthority.byId.install;
            const rollbackAction = entry.actionAuthority.byId.rollback;

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
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 0.75 }}>
                          {presentation.primaryStatus.label} • {presentation.sourceLabel}
                        </Typography>
                      </Box>
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
                        label={presentation.primaryStatus.explanation}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Version: ${presentation.versionSummary}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Source: ${presentation.sourceLabel}`}
                      />
                    </Stack>

                    {presentation.remediation ? (
                      <Alert
                        severity={presentation.primaryStatus.tone === 'error' ? 'error' : 'warning'}
                        sx={{ mt: 2 }}
                      >
                        {presentation.remediation.title}: {presentation.remediation.detail}
                      </Alert>
                    ) : null}

                    {entry.sourceResolution.resolverFailureCodes.length > 0 ? (
                      <Alert severity="error" sx={{ mt: 2 }}>
                        Source resolution failed:{' '}
                        {entry.sourceResolution.resolverFailureCodes.join(', ')}
                      </Alert>
                    ) : null}

                    {!installAction?.enabled && !plugin.installed ? (
                      <Alert severity="warning" sx={{ mt: 2 }}>
                        Install blocked: {installAction?.reasonCode || 'blocked'}.{' '}
                        {installAction?.safeExplanation}
                      </Alert>
                    ) : null}

                    {entry.operation.hasActive ? (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        Operation in progress: {entry.operation.stage || 'unknown stage'} (status:{' '}
                        {entry.operation.status || 'unknown'}).
                      </Alert>
                    ) : null}

                    {entry.operation.recoveryRequired ? (
                      <Alert severity="error" sx={{ mt: 2 }}>
                        Recovery required: {entry.reconciliation.message}{' '}
                        {entry.reconciliation.remediation}
                      </Alert>
                    ) : null}

                    {entry.migrationCheckpoint.interrupted ? (
                      <Alert severity="warning" sx={{ mt: 2 }}>
                        Interrupted migration checkpoint:{' '}
                        {entry.migrationCheckpoint.interruptedMigrationId || 'unknown migration'} (
                        {entry.migrationCheckpoint.interruptedDirection || 'unknown direction'}).
                      </Alert>
                    ) : null}

                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                      <Chip
                        size="small"
                        color={rollbackAction?.enabled ? 'success' : 'default'}
                        label={
                          rollbackAction?.enabled
                            ? 'Rollback available'
                            : `Rollback blocked: ${entry.rollback.reasonCode}`
                        }
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Primary action: ${presentation.primaryAction?.label || 'None'}`}
                      />
                      {entry.operation.leaseOwner ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Lease ${entry.operation.leaseOwner}${entry.operation.leaseExpired ? ' (expired)' : ''}`}
                        />
                      ) : null}
                    </Stack>
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      {plugin.updatedAt
                        ? `Updated ${new Date(plugin.updatedAt).toLocaleString()}`
                        : `Default: ${plugin.enabledByDefault ? 'enabled' : 'disabled'} • ${presentation.primaryStatus.explanation}`}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        onClick={() => setSelectedPluginId(plugin.id)}
                        aria-label={`Inspect ${plugin.name}`}
                      >
                        Inspect
                      </Button>
                      {presentation.primaryAction ? (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={isPending || !presentation.primaryAction}
                          onClick={() => {
                            if (presentation.primaryAction?.id === 'install') {
                              setInstallDialogPluginId(plugin.id);
                              return;
                            }

                            if (
                              presentation.primaryAction?.id === 'enable' ||
                              presentation.primaryAction?.id === 'disable'
                            ) {
                              void togglePlugin(entry);
                            }
                          }}
                        >
                          {presentation.primaryAction.label}
                        </Button>
                      ) : null}
                      {plugin.adminSurface?.href ? (
                        <Button component={Link} href={plugin.adminSurface.href} size="small">
                          {plugin.adminSurface.label || 'Open details'}
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
              {(() => {
                const presentation = derivePluginManagementPresentation(
                  toPresentationInput(selectedPlugin)
                );

                return (
                  <Alert
                    severity={
                      presentation.primaryStatus.tone === 'error'
                        ? 'error'
                        : presentation.primaryStatus.tone === 'warning'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    <strong>{presentation.primaryStatus.label}:</strong>{' '}
                    {presentation.primaryStatus.explanation}
                  </Alert>
                );
              })()}
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
                  label={`Source: ${selectedPlugin.sourceResolution.localOverrideEnabled ? 'Local override' : selectedPlugin.sourceResolution.resolvedSourceKind || 'unresolved'}`}
                />
                <Chip size="small" label={`Version: ${selectedPlugin.catalogEntry.version}`} />
              </Stack>

              <Typography variant="subtitle2">Overview</Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Canonical status"
                    secondary={selectedPlugin.lifecycleState.summaryState}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Source"
                    secondary={
                      selectedPlugin.sourceResolution.localOverrideEnabled
                        ? 'Local override active'
                        : 'Canonical catalog source'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Installed version"
                    secondary={selectedPlugin.plugin.installedVersion || 'Not installed'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Build and deployment"
                    secondary={`build=${selectedPlugin.lifecycleState.axes.build}, deploy=${selectedPlugin.lifecycleState.axes.deployment}, runtime=${selectedPlugin.lifecycleState.axes.runtime}`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Runtime and recovery"
                    secondary={`health=${selectedPlugin.lifecycleState.axes.health}, recovery=${selectedPlugin.lifecycleState.axes.recovery}`}
                  />
                </ListItem>
              </List>

              <Typography variant="subtitle2">Actions and remediation</Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Primary action"
                    secondary={selectedPlugin.actionAuthority.available[0]?.id || 'None available'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Blocked actions"
                    secondary={
                      selectedPlugin.actionAuthority.blocked.length > 0
                        ? selectedPlugin.actionAuthority.blocked
                            .map((action) => `${action.id}:${action.reasonCode || 'blocked'}`)
                            .join(', ')
                        : 'None'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Remediation"
                    secondary={
                      selectedPlugin.operation.recoveryRequired
                        ? selectedPlugin.reconciliation.remediation
                        : selectedPlugin.reconciliation.message
                    }
                  />
                </ListItem>
              </List>

              <Typography variant="subtitle2">Trust and compatibility</Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Trust result"
                    secondary={`${selectedPlugin.signature.status} • ${selectedPlugin.trustPolicy.reasonCode}`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Compatibility"
                    secondary={`Install readiness: ${selectedPlugin.catalogEntry.installReadiness}`}
                  />
                </ListItem>
              </List>

              <Typography variant="subtitle2">Lifecycle and deployment</Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Desired / observed"
                    secondary={`${selectedPlugin.desiredLifecycleState} / ${selectedPlugin.observedLifecycleState}`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Operation"
                    secondary={
                      selectedPlugin.operation.operationId
                        ? `${selectedPlugin.operation.operationId} (${selectedPlugin.operation.status || 'unknown'})`
                        : 'No active operation'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Rollback"
                    secondary={
                      selectedPlugin.rollback.eligible
                        ? 'Eligible'
                        : `Blocked (${selectedPlugin.rollback.reasonCode})`
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Recovery Center"
                    secondary={
                      selectedPlugin.operation.recoveryRequired
                        ? 'Open Recovery Center to continue safely.'
                        : 'No recovery action required.'
                    }
                  />
                </ListItem>
              </List>

              <Typography variant="subtitle2">Technical details</Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Latest transition"
                    secondary={selectedPlugin.latestTransition.transition || 'none'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Migration checkpoint"
                    secondary={
                      selectedPlugin.migrationCheckpoint.interrupted
                        ? `Interrupted ${selectedPlugin.migrationCheckpoint.interruptedMigrationId || 'unknown'}`
                        : 'No interruption recorded'
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Resolver diagnostics"
                    secondary={
                      selectedPlugin.sourceResolution.resolverFailureCodes.length > 0
                        ? selectedPlugin.sourceResolution.resolverFailureCodes.join(', ')
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
                      Canonical status:{' '}
                      {
                        derivePluginManagementPresentation(toPresentationInput(plugin))
                          .primaryStatus.label
                      }{' '}
                      • Trust: {plugin.trustPolicy.reasonCode}.
                    </Typography>
                    <Typography color="text.secondary">
                      Migrations: {plugin.migration.migrationCount}. Policy:{' '}
                      {plugin.migration.policy}.
                    </Typography>
                    <Typography color="text.secondary">
                      Data risk: destructiveDataWipe={plugin.migration.destructiveDataWipe}.
                    </Typography>
                    {!plugin.actionAuthority.byId.install.enabled ? (
                      <Alert severity="warning">
                        Install blocked: {plugin.actionAuthority.byId.install.reasonCode}.{' '}
                        {plugin.actionAuthority.byId.install.safeExplanation}
                      </Alert>
                    ) : null}
                  </Stack>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setInstallDialogPluginId(null)}>Cancel</Button>
                  <Button
                    variant="contained"
                    disabled={
                      !plugin.actionAuthority.byId.install.enabled ||
                      pendingPluginId === plugin.plugin.id
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
