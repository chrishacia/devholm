'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid2 as Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

type UrlShortenerLink = {
  id: string;
  code: string;
  destinationUrl: string;
  title: string | null;
  isActive: boolean;
  expiresAt: string | null;
  redirectStatusCode: number;
  cachedClickCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type UrlShortenerOverview = {
  totalLinks: number;
  activeLinks: number;
  disabledLinks: number;
  expiredLinks: number;
  totalClicks: number;
  recentDailyClicks: Array<{ date: string; totalClicks: number }>;
};

type UrlShortenerSettings = {
  routePrefix: string;
  publicCreationMode: 'admin-only' | 'authenticated' | 'public-with-approval';
  legacyPrefixEnabled: boolean;
};

const redirectStatusOptions = [301, 302, 307, 308] as const;

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || 'Request failed');
  }

  return payload;
}

function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            {title}
          </Typography>
          <Typography color="text.secondary">{description}</Typography>
        </Box>
        {children}
      </Stack>
    </Box>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {title}
            </Typography>
            <Typography color="text.secondary">{description}</Typography>
          </Box>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={0.5}>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={800}>
            {value}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function UrlShortenerOverviewPage() {
  const [overview, setOverview] = useState<UrlShortenerOverview | null>(null);
  const [links, setLinks] = useState<UrlShortenerLink[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [overviewResult, linksResult] = await Promise.all([
          jsonRequest<{ overview: UrlShortenerOverview }>('/api/url-shortener/overview'),
          jsonRequest<{ links: UrlShortenerLink[] }>('/api/url-shortener/links'),
        ]);
        setOverview(overviewResult.overview);
        setLinks(linksResult.links);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load overview');
      }
    })();
  }, []);

  return (
    <PageShell
      title="URL Shortener Overview"
      description="Live plugin summary, recent activity, and link inventory for the MVP."
    >
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Total links" value={overview?.totalLinks ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Active" value={overview?.activeLinks ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Disabled" value={overview?.disabledLinks ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Clicks" value={overview?.totalClicks ?? 0} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Section title="Recent links" description="Newest active and archived short links.">
            <Stack spacing={1.5}>
              {links.length > 0 ? (
                links.slice(0, 5).map((link) => (
                  <Box key={link.id}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      spacing={1}
                      sx={{ flexWrap: 'wrap' }}
                    >
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography fontWeight={700}>/{link.code}</Typography>
                          <Chip
                            size="small"
                            color={link.isActive ? 'success' : 'default'}
                            label={link.isActive ? 'Active' : 'Disabled'}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${link.cachedClickCount} clicks`}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {link.title || 'Untitled'} · {link.destinationUrl}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Updated {formatTime(link.updatedAt)}
                      </Typography>
                    </Stack>
                    <Divider sx={{ mt: 1.5 }} />
                  </Box>
                ))
              ) : (
                <Alert severity="info">No short links have been created yet.</Alert>
              )}
            </Stack>
          </Section>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Section
            title="Daily stats"
            description="Privacy-safe daily click totals with no raw IP storage."
          >
            <Stack spacing={1}>
              {overview?.recentDailyClicks?.length ? (
                overview.recentDailyClicks.map((point) => (
                  <Stack key={point.date} direction="row" justifyContent="space-between">
                    <Typography>{point.date}</Typography>
                    <Typography fontWeight={700}>{point.totalClicks}</Typography>
                  </Stack>
                ))
              ) : (
                <Alert severity="info">No daily click activity has been recorded yet.</Alert>
              )}
            </Stack>
          </Section>
        </Grid>
      </Grid>
    </PageShell>
  );
}

export function UrlShortenerLinksPage() {
  const [links, setLinks] = useState<UrlShortenerLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    destinationUrl: '',
    title: '',
    redirectStatusCode: 302,
    expiresAt: '',
  });

  const refresh = () => {
    void (async () => {
      try {
        const result = await jsonRequest<{ links: UrlShortenerLink[] }>('/api/url-shortener/links');
        setLinks(result.links);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load links');
      }
    })();
  };

  useEffect(() => {
    refresh();
  }, []);

  async function createLink() {
    setError(null);
    setSuccess(null);

    try {
      await jsonRequest('/api/url-shortener/links', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code || undefined,
          destinationUrl: form.destinationUrl,
          title: form.title || undefined,
          redirectStatusCode: form.redirectStatusCode,
          expiresAt: form.expiresAt || undefined,
        }),
      });
      setForm({ code: '', destinationUrl: '', title: '', redirectStatusCode: 302, expiresAt: '' });
      setSuccess('Short link created successfully.');
      refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create link');
    }
  }

  async function updateLink(code: string, patch: Partial<UrlShortenerLink>) {
    setError(null);
    setSuccess(null);

    try {
      await jsonRequest(`/api/url-shortener/links/${code}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setSuccess(`Updated ${code}.`);
      refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update link');
    }
  }

  async function deleteLink(code: string) {
    setError(null);
    setSuccess(null);

    try {
      await jsonRequest(`/api/url-shortener/links/${code}`, { method: 'DELETE' });
      setSuccess(`Deleted ${code}.`);
      refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete link');
    }
  }

  return (
    <PageShell
      title="URL Shortener Links"
      description="Create, edit, disable, and delete short links."
    >
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Section
        title="Create short link"
        description="Generate or choose a code, set the destination, and choose the redirect behavior."
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              label="Custom code"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              helperText="Optional. Leave blank to generate one."
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              label="Destination URL"
              value={form.destinationUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, destinationUrl: event.target.value }))
              }
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              label="Title"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              select
              fullWidth
              label="Redirect status"
              value={form.redirectStatusCode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  redirectStatusCode: Number(event.target.value),
                }))
              }
            >
              {redirectStatusOptions.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              label="Expires at"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, expiresAt: event.target.value }))
              }
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>
        <Button variant="contained" onClick={createLink}>
          Create link
        </Button>
      </Section>

      <Stack spacing={2}>
        {links.length > 0 ? (
          links.map((link) => (
            <Card key={link.id} variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    flexWrap="wrap"
                  >
                    <Box>
                      <Typography variant="h6" fontWeight={700}>
                        /{link.code}
                      </Typography>
                      <Typography color="text.secondary">
                        {link.title || 'Untitled'} · {link.destinationUrl}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Chip
                        size="small"
                        label={link.isActive ? 'Active' : 'Disabled'}
                        color={link.isActive ? 'success' : 'default'}
                      />
                      <Chip size="small" variant="outlined" label={`${link.redirectStatusCode}`} />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${link.cachedClickCount} clicks`}
                      />
                    </Stack>
                  </Stack>

                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField
                        fullWidth
                        label="Destination URL"
                        defaultValue={link.destinationUrl}
                        onBlur={(event) => {
                          if (event.target.value !== link.destinationUrl) {
                            void updateLink(link.code, { destinationUrl: event.target.value });
                          }
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField
                        fullWidth
                        label="Title"
                        defaultValue={link.title ?? ''}
                        onBlur={(event) => {
                          const value = event.target.value;
                          if (value !== (link.title ?? '')) {
                            void updateLink(link.code, { title: value });
                          }
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField
                        select
                        fullWidth
                        label="Redirect status"
                        defaultValue={link.redirectStatusCode}
                        onChange={(event) =>
                          void updateLink(link.code, {
                            redirectStatusCode: Number(event.target.value),
                          })
                        }
                      >
                        {redirectStatusOptions.map((status) => (
                          <MenuItem key={status} value={status}>
                            {status}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                  </Grid>

                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button
                      variant="outlined"
                      onClick={() => void updateLink(link.code, { isActive: !link.isActive })}
                    >
                      {link.isActive ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      color="error"
                      variant="outlined"
                      onClick={() => void deleteLink(link.code)}
                    >
                      Delete
                    </Button>
                  </Stack>

                  <Typography variant="caption" color="text.secondary">
                    Expires {formatTime(link.expiresAt)} · Created {formatTime(link.createdAt)}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          ))
        ) : (
          <Alert severity="info">No links yet.</Alert>
        )}
      </Stack>
    </PageShell>
  );
}

export function UrlShortenerAnalyticsPage() {
  const [overview, setOverview] = useState<UrlShortenerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const result = await jsonRequest<{ overview: UrlShortenerOverview }>(
          '/api/url-shortener/analytics'
        );
        setOverview(result.overview);
      } catch (analyticsError) {
        setError(
          analyticsError instanceof Error ? analyticsError.message : 'Failed to load analytics'
        );
      }
    })();
  }, []);

  return (
    <PageShell
      title="URL Shortener Analytics"
      description="Daily totals and privacy-safe activity summaries."
    >
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Clicks" value={overview?.totalClicks ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Active links" value={overview?.activeLinks ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Disabled" value={overview?.disabledLinks ?? 0} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SummaryCard label="Expired" value={overview?.expiredLinks ?? 0} />
        </Grid>
      </Grid>
      <Section
        title="Recent daily clicks"
        description="Day-by-day totals for the last reporting window."
      >
        {overview?.recentDailyClicks?.length ? (
          overview.recentDailyClicks.map((entry) => (
            <Stack key={entry.date} direction="row" justifyContent="space-between">
              <Typography>{entry.date}</Typography>
              <Typography fontWeight={700}>{entry.totalClicks}</Typography>
            </Stack>
          ))
        ) : (
          <Alert severity="info">No analytics have been recorded yet.</Alert>
        )}
      </Section>
    </PageShell>
  );
}

export function UrlShortenerSettingsPage() {
  const [settings, setSettings] = useState<UrlShortenerSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const result = await jsonRequest<{ settings: UrlShortenerSettings }>(
          '/api/url-shortener/settings'
        );
        setSettings(result.settings);
      } catch (settingsError) {
        setError(
          settingsError instanceof Error ? settingsError.message : 'Failed to load settings'
        );
      }
    })();
  }, []);

  const current = settings ?? {
    routePrefix: '/s',
    publicCreationMode: 'admin-only' as const,
    legacyPrefixEnabled: false,
  };

  async function saveSettings(next: UrlShortenerSettings) {
    setError(null);
    setSuccess(null);

    try {
      await jsonRequest('/api/url-shortener/settings', {
        method: 'PATCH',
        body: JSON.stringify(next),
      });
      setSettings(next);
      setSuccess('Settings updated.');
    } catch (settingsError) {
      setError(
        settingsError instanceof Error ? settingsError.message : 'Failed to update settings'
      );
    }
  }

  return (
    <PageShell
      title="URL Shortener Settings"
      description="Route prefix, creation mode, and legacy alias controls for the plugin."
    >
      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}
      <Section
        title="Plugin settings"
        description="These settings are stored in the plugin-owned site settings."
      >
        <TextField
          label="Route prefix"
          value={current.routePrefix}
          onChange={(event) =>
            setSettings((value) => ({ ...(value ?? current), routePrefix: event.target.value }))
          }
          helperText="Public prefix for redirect URLs, e.g. /s or /go."
        />
        <TextField
          select
          label="Public creation mode"
          value={current.publicCreationMode}
          onChange={(event) =>
            setSettings((value) => ({
              ...(value ?? current),
              publicCreationMode: event.target.value as UrlShortenerSettings['publicCreationMode'],
            }))
          }
        >
          <MenuItem value="admin-only">Admin only</MenuItem>
          <MenuItem value="authenticated">Authenticated</MenuItem>
          <MenuItem value="public-with-approval">Public with approval</MenuItem>
        </TextField>
        <Stack direction="row" spacing={2} alignItems="center">
          <Chip
            label={current.legacyPrefixEnabled ? 'Legacy prefix enabled' : 'Legacy prefix disabled'}
            color={current.legacyPrefixEnabled ? 'warning' : 'default'}
          />
          <Button
            variant="outlined"
            onClick={() =>
              setSettings((value) => ({
                ...(value ?? current),
                legacyPrefixEnabled: !(value ?? current).legacyPrefixEnabled,
              }))
            }
          >
            Toggle legacy prefix
          </Button>
        </Stack>
        <Button variant="contained" onClick={() => void saveSettings(current)}>
          Save settings
        </Button>
      </Section>
    </PageShell>
  );
}

export function UrlShortenerPublicSubmissionsPage() {
  return (
    <PageShell
      title="URL Shortener Public Submissions"
      description="Public submission workflows are intentionally deferred until after the admin-managed MVP."
    >
      <Alert severity="info">
        This page remains a placeholder for the follow-on submission workflow.
      </Alert>
    </PageShell>
  );
}
