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
                    pt: 0.5,
                  }}
                >
                  <StatusChip value={status.updateAvailable} />
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Sync />}
                    onClick={() => fetchStatus(true)}
                    disabled={refreshing}
                  >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
