'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid2 as Grid,
  Stack,
  Typography,
} from '@mui/material';
import { OpenInNew, Sync } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

type UpdateStatus = {
  sourceRepo: string;
  current: {
    version: string;
    buildSha: string;
  };
  latest: {
    repo: string;
    tagName: string;
    version: string;
    name: string;
    url: string;
    publishedAt: string;
  } | null;
  updateAvailable: boolean | null;
  warning?: string;
  automation?: {
    siteRepo: string;
    workflowFile: string;
    workflowRef: string;
    repoPrivate: boolean | null;
    canTriggerUpdate: boolean;
    warning?: string;
  };
};

type WorkflowRunStatus = {
  run: {
    id: number;
    status: string;
    conclusion: string | null;
    htmlUrl: string;
    title: string;
    updatedAt: string;
  };
  summary: {
    activeJob: string | null;
    failedJob: string | null;
    completed: boolean;
  };
};

function StatusChip({ value }: { value: boolean | null }) {
  if (value === true) {
    return <Chip color="warning" label="Update Available" size="small" />;
  }

  if (value === false) {
    return <Chip color="success" label="Up To Date" size="small" />;
  }

  return <Chip color="default" label="Unknown" size="small" />;
}

export default function UpdatesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [runStatus, setRunStatus] = useState<WorkflowRunStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  const fetchStatus = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else if (!status) {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetch('/api/admin/updates');
      if (!response.ok) {
        throw new Error('Failed to fetch update status');
      }

      const payload = await response.json();
      setStatus(payload.data as UpdateStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected update status error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!runStatus || runStatus.summary.completed) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/updates/run/${runStatus.run.id}`);
        if (!response.ok) return;
        const payload = await response.json();
        setRunStatus(payload.data as WorkflowRunStatus);
      } catch {
        // no-op
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [runStatus]);

  const triggerUpdate = async () => {
    setTriggering(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/updates', {
        method: 'POST',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to trigger update workflow');
      }

      const payload = (await response.json()) as {
        data: { runId: number | null; runUrl: string | null };
      };

      if (payload.data.runId) {
        const runResponse = await fetch(`/api/admin/updates/run/${payload.data.runId}`);
        if (runResponse.ok) {
          const runPayload = await runResponse.json();
          setRunStatus(runPayload.data as WorkflowRunStatus);
        }
      }

      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger update workflow');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !status) {
    return <Alert severity="error">{error || 'Update status unavailable.'}</Alert>;
  }

  const latestPublished = status.latest?.publishedAt
    ? formatDistanceToNow(new Date(status.latest.publishedAt), { addSuffix: true })
    : null;
  const currentVersionTag =
    status.current.version !== 'unknown' ? `v${status.current.version}` : null;
  const currentVersionNotesUrl = currentVersionTag
    ? `https://github.com/${status.sourceRepo}/releases/tag/${encodeURIComponent(currentVersionTag)}`
    : null;

  return (
    <Stack spacing={3}>
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          flexDirection: { xs: 'column', md: 'row' },
        }}
      >
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Updates
        </Typography>
        {status.latest?.url ? (
          <Button
            variant="outlined"
            href={status.latest.url}
            target="_blank"
            rel="noreferrer"
            startIcon={<OpenInNew />}
          >
            Latest Version Notes
          </Button>
        ) : null}
      </Box>

      {status.warning ? <Alert severity="warning">{status.warning}</Alert> : null}
      {status.automation?.warning ? (
        <Alert severity="info">{status.automation.warning}</Alert>
      ) : null}
      {status.automation?.repoPrivate ? (
        <Alert severity="info">
          This repository is private. Running an update may consume GitHub Actions minutes based on
          your plan.
        </Alert>
      ) : null}

      {runStatus ? (
        <Alert severity={runStatus.run.conclusion === 'failure' ? 'error' : 'info'}>
          <Stack spacing={0.5}>
            <Typography variant="body2" fontWeight={600}>
              Update Run: {runStatus.run.title}
            </Typography>
            <Typography variant="body2">
              Status: {runStatus.run.status}
              {runStatus.run.conclusion ? ` (${runStatus.run.conclusion})` : ''}
            </Typography>
            {runStatus.summary.activeJob ? (
              <Typography variant="body2">Active step: {runStatus.summary.activeJob}</Typography>
            ) : null}
            {runStatus.summary.failedJob ? (
              <Typography variant="body2">Failed step: {runStatus.summary.failedJob}</Typography>
            ) : null}
            {runStatus.run.htmlUrl ? (
              <Box>
                <Button
                  size="small"
                  variant="text"
                  href={runStatus.run.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  startIcon={<OpenInNew />}
                >
                  Open Workflow Logs
                </Button>
              </Box>
            ) : null}
          </Stack>
        </Alert>
      ) : null}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">
                  Current DevHolm Version
                </Typography>
                <Typography variant="h5" fontWeight={700}>
                  {status.current.version === 'unknown' ? 'Unknown' : `v${status.current.version}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Build SHA: {status.current.buildSha ? status.current.buildSha.slice(0, 7) : 'n/a'}
                </Typography>
                <Box sx={{ pt: 0.5 }}>
                  {currentVersionNotesUrl ? (
                    <Button
                      size="small"
                      variant="text"
                      href={currentVersionNotesUrl}
                      target="_blank"
                      rel="noreferrer"
                      startIcon={<OpenInNew />}
                    >
                      Installed Version Notes
                    </Button>
                  ) : null}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">
                  Template Release
                </Typography>
                <Typography variant="h5" fontWeight={700}>
                  {status.latest ? status.latest.tagName : 'Unknown'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Source: {status.sourceRepo}
                </Typography>
                {latestPublished ? (
                  <Typography variant="body2" color="text.secondary">
                    Published {latestPublished}
                  </Typography>
                ) : null}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1,
                    pt: 0.5,
                    flexWrap: 'wrap',
                  }}
                >
                  <StatusChip value={status.updateAvailable} />
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Sync />}
                      onClick={() => fetchStatus(true)}
                      disabled={refreshing}
                    >
                      {refreshing ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={triggerUpdate}
                      disabled={triggering || !status.automation?.canTriggerUpdate}
                    >
                      {triggering ? 'Starting...' : 'Run Update'}
                    </Button>
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
