'use client';

/**
 * Admin Analytics Dashboard (v2)
 * ================================
 *
 * Enhanced analytics dashboard with:
 * - Session quality panel (bounce rate, depth, entry/exit pages)
 * - Attribution panel (traffic sources, campaign performance, referrers)
 * - Audience technology panel (device, browser, OS)
 * - Site quality panel (status codes, 404s)
 * - Data health panel
 * - Collapsible sections
 *
 * Privacy-first: session-only tracking, no persistent IDs, no IP storage.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Theme } from '@mui/material';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Grid2 as Grid,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Alert,
  LinearProgress,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Visibility,
  People,
  TrendingUp,
  TrendingDown,
  Language,
  Refresh,
  OpenInNew,
  ErrorOutline,
  ChevronRight,
  ArrowBack,
  BarChart,
  DevicesOther,
  BugReport,
  ExpandMore,
  ExpandLess,
  Campaign,
  AccessTime,
  ExitToApp,
  Input,
} from '@mui/icons-material';
import { format } from 'date-fns';

// =============================================================================
// Types
// =============================================================================

interface SessionDepthBucket {
  bucket: '1' | '2-3' | '4-6' | '7-10' | '11+';
  sessions: number;
}

interface HourlyTrafficPoint {
  hour: number;
  views: number;
  visitors: number;
}

interface CampaignRow {
  campaign: string;
  source: string | null;
  medium: string | null;
  visits: number;
  uniqueVisitors: number;
}

interface BreakdownRow {
  label: string;
  visits: number;
  uniqueVisitors: number;
}

interface AnalyticsSummary {
  totalPageViews: number;
  uniqueVisitors: number;
  total404s: number;
  pagesPerVisit: number;
  bounceRate: number;
  topPages: Array<{ path: string; views: number; uniqueVisitors: number }>;
  entryPages: Array<{ path: string; sessions: number }>;
  exitPages: Array<{ path: string; sessions: number }>;
  topReferrers: Array<{ domain: string | null; visits: number; uniqueVisitors: number }>;
  recentReferrers: Array<{ domain: string; url: string; visitedAt: string }>;
  viewsByDay: Array<{ date: string; views: number; visitors: number }>;
  hourlyTraffic: HourlyTrafficPoint[];
  peakHours: Array<{ hour: number; views: number }>;
  sessionDepth: SessionDepthBucket[];
  trafficSources: Array<{ source: string; visits: number }>;
  campaignPerformance: CampaignRow[];
  deviceBreakdown: BreakdownRow[];
  browserBreakdown: BreakdownRow[];
  osBreakdown: BreakdownRow[];
  statusCodeMix: Array<{ statusCode: number; hits: number }>;
  top404s: Array<{ path: string; hits: number; lastHit: string }>;
  dataHealth: {
    latestEventAt: string | null;
    latestRollupAt: string | null;
    rawRetentionDays: number;
    persistentVisitorIdEnabled: boolean;
  };
}

type DrillDownView = 'pages' | 'referrers' | '404s' | 'page-referrers' | 'referrer-pages' | null;

interface BreadcrumbItem {
  view: DrillDownView;
  label: string;
  context?: string;
}

interface PaginatedData<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type DrillDownRow = Record<string, unknown>;

// =============================================================================
// Helpers
// =============================================================================

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

function getStatusColor(code: number, theme: Theme) {
  if (code >= 500) return theme.palette.error.main;
  if (code >= 400) return theme.palette.warning.main;
  if (code >= 300) return theme.palette.info.main;
  return theme.palette.success.main;
}

// =============================================================================
// Stats Card
// =============================================================================

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  note?: string;
}

function StatsCard({ title, value, icon, color, subtitle, note }: StatsCardProps) {
  return (
    <Card
      sx={{
        height: '100%',
        background: `linear-gradient(135deg, ${alpha(color, 0.1)} 0%, ${alpha(color, 0.05)} 100%)`,
        border: `1px solid ${alpha(color, 0.2)}`,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                textTransform: 'uppercase',
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, color }}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {subtitle}
              </Typography>
            )}
            {note && (
              <Typography
                variant="caption"
                display="block"
                sx={{ color: 'text.disabled', mt: 0.25 }}
              >
                {note}
              </Typography>
            )}
          </Box>
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(color, 0.1), color }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Bar Row (reusable horizontal bar for breakdowns)
// =============================================================================

interface BarRowProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function BarRow({ label, value, total, color }: BarRowProps) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: '68%' }}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {value.toLocaleString()}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6,
          borderRadius: 1,
          bgcolor: alpha(color, 0.12),
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
        }}
      />
    </Box>
  );
}

// =============================================================================
// Views Over Time Chart
// =============================================================================

function SimpleChart({
  data,
  days,
}: {
  data: Array<{ date: string; views: number }>;
  days: number;
}) {
  const theme = useTheme();
  const maxViews = Math.max(...data.map((d) => d.views), 1);
  const labelEvery = days <= 7 ? 1 : days <= 30 ? 3 : days <= 90 ? 7 : 30;

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 120 }}>
      {data.map((item, idx) => {
        const height = (item.views / maxViews) * 100;
        const date = new Date(item.date);
        return (
          <Tooltip
            key={item.date}
            title={`${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${item.views.toLocaleString()} views`}
            arrow
          >
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  height: `${Math.max(height, 3)}%`,
                  bgcolor: theme.palette.primary.main,
                  borderRadius: '3px 3px 0 0',
                  minHeight: 3,
                  '&:hover': { opacity: 0.75 },
                }}
              />
              {idx % labelEvery === 0 && (
                <Typography
                  variant="caption"
                  sx={{ mt: 0.5, fontSize: '0.6rem', color: 'text.disabled' }}
                >
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Typography>
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

// =============================================================================
// Hourly Traffic Chart
// =============================================================================

function HourlyChart({ data }: { data: HourlyTrafficPoint[] }) {
  const theme = useTheme();
  const filled = Array.from(
    { length: 24 },
    (_, h) => data.find((d) => d.hour === h) ?? { hour: h, views: 0, visitors: 0 }
  );
  const maxViews = Math.max(...filled.map((d) => d.views), 1);
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 90 }}>
      {filled.map((item) => (
        <Tooltip
          key={item.hour}
          title={`${formatHour(item.hour)}: ${item.views.toLocaleString()} views`}
          arrow
        >
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                width: '100%',
                height: `${Math.max((item.views / maxViews) * 100, 3)}%`,
                bgcolor: theme.palette.info.main,
                borderRadius: '2px 2px 0 0',
                minHeight: 3,
                '&:hover': { opacity: 0.75 },
              }}
            />
            {item.hour % 6 === 0 && (
              <Typography
                variant="caption"
                sx={{ mt: 0.25, fontSize: '0.58rem', color: 'text.disabled' }}
              >
                {formatHour(item.hour)}
              </Typography>
            )}
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

// =============================================================================
// Collapsible Section
// =============================================================================

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ mb: 1 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          mb: 2,
          '&:hover': { opacity: 0.8 },
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Box sx={{ color: 'text.secondary' }}>{icon}</Box>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          {title}
        </Typography>
        {open ? (
          <ExpandLess sx={{ color: 'text.secondary' }} />
        ) : (
          <ExpandMore sx={{ color: 'text.secondary' }} />
        )}
      </Box>
      <Collapse in={open}>{children}</Collapse>
    </Box>
  );
}

// =============================================================================
// Main Dashboard
// =============================================================================

export default function AnalyticsDashboard() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [dateRange, setDateRange] = useState(30);
  const [drillDownView, setDrillDownView] = useState<DrillDownView>(null);
  const [drillDownData, setDrillDownData] = useState<PaginatedData<unknown> | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownPage, setDrillDownPage] = useState(1);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentContext, setCurrentContext] = useState<string | null>(null);

  const drillDownRows = Array.isArray(drillDownData?.data)
    ? (drillDownData.data as DrillDownRow[])
    : [];

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?action=summary&days=${dateRange}`);
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'You must be logged in to view analytics.'
            : 'Failed to load analytics data.'
        );
        return;
      }
      setData(await res.json());
    } catch {
      setError('An error occurred while loading analytics.');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  const fetchDrillDown = useCallback(
    async (view: DrillDownView, page = 1, context?: string) => {
      if (!view) return;
      setDrillDownLoading(true);
      try {
        let url = `/api/analytics?days=${dateRange}&page=${page}&limit=25`;
        if (view === 'pages') url += '&action=all-pages';
        else if (view === 'referrers') url += '&action=all-referrers';
        else if (view === '404s') url += '&action=all-404s';
        else if (view === 'page-referrers' && context)
          url += `&action=page-referrers&pagePath=${encodeURIComponent(context)}`;
        else if (view === 'referrer-pages' && context)
          url += `&action=referrer-pages&domain=${encodeURIComponent(context)}`;
        const res = await fetch(url);
        if (res.ok) {
          const r = await res.json();
          setDrillDownData({
            data: r.pages || r.referrers || r.errors || [],
            total: r.total,
            page: r.page,
            limit: r.limit,
            totalPages: r.totalPages,
          });
        }
      } catch (err) {
        console.error('Drill-down error:', err);
      } finally {
        setDrillDownLoading(false);
      }
    },
    [dateRange]
  );

  const getViewTitle = (v: DrillDownView) =>
    v === 'pages'
      ? 'All Pages'
      : v === 'referrers'
        ? 'All Referrers'
        : v === '404s'
          ? 'All 404 Errors'
          : v === 'page-referrers'
            ? 'Page Referrers'
            : 'Referrer Pages';

  const openDrillDown = (view: DrillDownView) => {
    setDrillDownView(view);
    setDrillDownPage(1);
    setCurrentContext(null);
    setBreadcrumbs([{ view, label: getViewTitle(view) }]);
    fetchDrillDown(view, 1);
  };
  const navigateNested = (view: DrillDownView, context: string, label: string) => {
    setBreadcrumbs((p) => [...p, { view, label, context }]);
    setDrillDownView(view);
    setDrillDownPage(1);
    setCurrentContext(context);
    fetchDrillDown(view, 1, context);
  };
  const navigateCrumb = (idx: number) => {
    const c = breadcrumbs[idx];
    setBreadcrumbs((p) => p.slice(0, idx + 1));
    setDrillDownView(c.view);
    setDrillDownPage(1);
    setCurrentContext(c.context || null);
    fetchDrillDown(c.view, 1, c.context);
  };
  const closeDrillDown = () => {
    setDrillDownView(null);
    setDrillDownData(null);
    setDrillDownPage(1);
    setBreadcrumbs([]);
    setCurrentContext(null);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const getReferrerIcon = (domain: string | null) => {
    if (!domain) return <Language />;
    if (/facebook|twitter|linkedin|instagram|reddit/.test(domain)) return <People />;
    if (/google|bing|duckduckgo|yahoo/.test(domain)) return <TrendingUp />;
    return <Language />;
  };

  const sourceColors = [
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.info.main,
    theme.palette.warning.main,
    theme.palette.secondary.main,
    theme.palette.grey[500],
  ];

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Privacy-first traffic insights — session-based, no IP storage
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Date Range</InputLabel>
            <Select
              value={dateRange}
              label="Date Range"
              onChange={(e) => setDateRange(Number(e.target.value))}
            >
              <MenuItem value={7}>Last 7 days</MenuItem>
              <MenuItem value={30}>Last 30 days</MenuItem>
              <MenuItem value={90}>Last 90 days</MenuItem>
              <MenuItem value={365}>Last year</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchAnalytics} disabled={loading}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && data && (
        <Box>
          {/* Summary Cards */}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <StatsCard
                title="Page Views"
                value={data.totalPageViews}
                icon={<Visibility />}
                color={theme.palette.primary.main}
                subtitle={`Last ${dateRange} days`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <StatsCard
                title="Unique Sessions"
                value={data.uniqueVisitors}
                icon={<People />}
                color={theme.palette.success.main}
                subtitle={`Last ${dateRange} days`}
                note="Session-based, not persistent visitors"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <StatsCard
                title="Pages / Visit"
                value={data.pagesPerVisit.toFixed(1)}
                icon={<TrendingUp />}
                color={theme.palette.info.main}
                subtitle="Average per session"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <StatsCard
                title="Bounce Rate"
                value={`${data.bounceRate.toFixed(1)}%`}
                icon={data.bounceRate > 70 ? <TrendingDown /> : <TrendingUp />}
                color={
                  data.bounceRate > 70 ? theme.palette.warning.main : theme.palette.success.main
                }
                subtitle="1-page sessions"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <StatsCard
                title="404 Errors"
                value={data.total404s}
                icon={<ErrorOutline />}
                color={data.total404s > 0 ? theme.palette.error.main : theme.palette.success.main}
                subtitle={`Last ${dateRange} days`}
              />
            </Grid>
          </Grid>

          {/* Traffic Trend */}
          <Section title="Traffic Trend" icon={<BarChart />}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 8 }}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      Views Over Time
                    </Typography>
                    {data.viewsByDay.length > 0 ? (
                      <SimpleChart data={data.viewsByDay} days={dateRange} />
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        No data for this period
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      Hourly Traffic
                    </Typography>
                    {data.hourlyTraffic.length > 0 ? (
                      <>
                        <HourlyChart data={data.hourlyTraffic} />
                        {data.peakHours.length > 0 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mt: 1, display: 'block' }}
                          >
                            Peak: {data.peakHours.map((p) => formatHour(p.hour)).join(', ')}
                          </Typography>
                        )}
                      </>
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        No hourly data yet
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Section>

          {/* Session Quality */}
          <Section title="Session Quality" icon={<AccessTime />}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      Session Depth
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 1.5 }}
                    >
                      Pages viewed per session
                    </Typography>
                    {data.sessionDepth.length > 0 ? (
                      (() => {
                        const total = data.sessionDepth.reduce((s, b) => s + b.sessions, 0);
                        return data.sessionDepth.map((b) => (
                          <BarRow
                            key={b.bucket}
                            label={`${b.bucket} page${b.bucket === '1' ? '' : 's'}`}
                            value={b.sessions}
                            total={total}
                            color={theme.palette.primary.main}
                          />
                        ));
                      })()
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No session data yet
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Input fontSize="small" sx={{ color: 'success.main' }} />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Entry Pages
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 1.5 }}
                    >
                      Where sessions begin
                    </Typography>
                    {data.entryPages.length > 0 ? (
                      <TableContainer>
                        <Table size="small">
                          <TableBody>
                            {data.entryPages.slice(0, 8).map((p) => (
                              <TableRow key={p.path} hover>
                                <TableCell sx={{ py: 0.75 }}>
                                  <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{ maxWidth: 180, display: 'block' }}
                                  >
                                    {p.path}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ py: 0.75 }}>
                                  <Typography variant="caption" color="text.secondary">
                                    {p.sessions.toLocaleString()}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No entry page data yet
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <ExitToApp fontSize="small" sx={{ color: 'warning.main' }} />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Exit Pages
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 1.5 }}
                    >
                      Where sessions end
                    </Typography>
                    {data.exitPages.length > 0 ? (
                      <TableContainer>
                        <Table size="small">
                          <TableBody>
                            {data.exitPages.slice(0, 8).map((p) => (
                              <TableRow key={p.path} hover>
                                <TableCell sx={{ py: 0.75 }}>
                                  <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{ maxWidth: 180, display: 'block' }}
                                  >
                                    {p.path}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ py: 0.75 }}>
                                  <Typography variant="caption" color="text.secondary">
                                    {p.sessions.toLocaleString()}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No exit page data yet
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Section>

          {/* Content Performance */}
          <Section title="Content Performance" icon={<Visibility />}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12 }}>
                <Card>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight={600}>
                        Top Pages
                      </Typography>
                      <Button
                        size="small"
                        endIcon={<ChevronRight />}
                        onClick={() => openDrillDown('pages')}
                      >
                        View All
                      </Button>
                    </Box>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Page</TableCell>
                            <TableCell align="right">Views</TableCell>
                            <TableCell align="right">Sessions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.topPages.length > 0 ? (
                            data.topPages.map((page, i) => (
                              <TableRow key={`${page.path}-${i}`} hover>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>
                                      {page.path}
                                    </Typography>
                                    <Tooltip title="Open page">
                                      <IconButton size="small" href={page.path} target="_blank">
                                        <OpenInNew fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" fontWeight={500}>
                                    {page.views.toLocaleString()}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" color="text.secondary">
                                    {page.uniqueVisitors.toLocaleString()}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} align="center">
                                <Typography color="text.secondary" sx={{ py: 2 }}>
                                  No page views yet
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Section>

          {/* Attribution */}
          <Section title="Attribution" icon={<Campaign />}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      Traffic Sources
                    </Typography>
                    {data.trafficSources.length > 0 ? (
                      data.trafficSources
                        .slice(0, 8)
                        .map((s, i) => (
                          <BarRow
                            key={s.source}
                            label={s.source === 'direct' ? 'Direct' : s.source}
                            value={s.visits}
                            total={data.totalPageViews}
                            color={sourceColors[i % sourceColors.length]}
                          />
                        ))
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No source data
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight={600}>
                        Top Referrers
                      </Typography>
                      <Button
                        size="small"
                        endIcon={<ChevronRight />}
                        onClick={() => openDrillDown('referrers')}
                      >
                        View All
                      </Button>
                    </Box>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Referrer</TableCell>
                            <TableCell align="right">Visits</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.topReferrers.length > 0 ? (
                            data.topReferrers.slice(0, 8).map((r, i) => (
                              <TableRow key={r.domain || `direct-${i}`} hover>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {getReferrerIcon(r.domain)}
                                    <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
                                      {r.domain || 'Direct'}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" fontWeight={500}>
                                    {r.visits.toLocaleString()}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={2} align="center">
                                <Typography color="text.secondary" sx={{ py: 2 }}>
                                  No referrer data
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      Campaign Performance
                    </Typography>
                    {data.campaignPerformance.length > 0 ? (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Campaign</TableCell>
                              <TableCell align="right">Visits</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {data.campaignPerformance.slice(0, 8).map((c, i) => (
                              <TableRow key={`${c.campaign}-${i}`} hover>
                                <TableCell>
                                  <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                                    {c.campaign}
                                  </Typography>
                                  {(c.source || c.medium) && (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      display="block"
                                    >
                                      {[c.source, c.medium].filter(Boolean).join(' / ')}
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" fontWeight={500}>
                                    {c.visits.toLocaleString()}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                        No UTM campaign data in this period
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Section>

          {/* Audience Technology */}
          <Section title="Audience Technology" icon={<DevicesOther />}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {[
                { title: 'Devices', data: data.deviceBreakdown, color: theme.palette.primary.main },
                {
                  title: 'Browsers',
                  data: data.browserBreakdown,
                  color: theme.palette.success.main,
                },
                {
                  title: 'Operating Systems',
                  data: data.osBreakdown,
                  color: theme.palette.info.main,
                },
              ].map(({ title, data: breakdown, color }) => (
                <Grid key={title} size={{ xs: 12, md: 4 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        {title}
                      </Typography>
                      {breakdown.length > 0 ? (
                        (() => {
                          const total = breakdown.reduce((s, d) => s + d.visits, 0);
                          return breakdown.map((d) => (
                            <BarRow
                              key={d.label}
                              label={d.label.charAt(0).toUpperCase() + d.label.slice(1)}
                              value={d.visits}
                              total={total}
                              color={color}
                            />
                          ));
                        })()
                      ) : (
                        <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                          No data yet
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Section>

          {/* Site Quality */}
          <Section title="Site Quality" icon={<BugReport />}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      Status Code Mix
                    </Typography>
                    {data.statusCodeMix.length > 0 ? (
                      (() => {
                        const total = data.statusCodeMix.reduce((s, c) => s + c.hits, 0);
                        return data.statusCodeMix.map((c) => (
                          <BarRow
                            key={c.statusCode}
                            label={`HTTP ${c.statusCode}`}
                            value={c.hits}
                            total={total}
                            color={getStatusColor(c.statusCode, theme)}
                          />
                        ));
                      })()
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No status data
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 8 }}>
                <Card>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ErrorOutline color="error" />
                        <Typography variant="subtitle1" fontWeight={600}>
                          404 Errors
                        </Typography>
                        {data.total404s > 0 && (
                          <Chip
                            label={data.total404s.toLocaleString()}
                            size="small"
                            color="error"
                            variant="outlined"
                          />
                        )}
                      </Box>
                      {data.top404s.length > 0 && (
                        <Button
                          size="small"
                          endIcon={<ChevronRight />}
                          onClick={() => openDrillDown('404s')}
                        >
                          View All
                        </Button>
                      )}
                    </Box>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Requested URL</TableCell>
                            <TableCell align="right">Hits</TableCell>
                            <TableCell align="right">Last Hit</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.top404s.length > 0 ? (
                            data.top404s.map((e, i) => (
                              <TableRow key={`${e.path}-${i}`} hover>
                                <TableCell>
                                  <Typography
                                    variant="body2"
                                    noWrap
                                    sx={{
                                      maxWidth: 360,
                                      fontFamily: 'monospace',
                                      color: 'error.main',
                                    }}
                                  >
                                    {e.path}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" fontWeight={500}>
                                    {e.hits.toLocaleString()}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" color="text.secondary">
                                    {format(new Date(e.lastHit), 'MMM d, h:mm a')}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} align="center">
                                <Typography color="text.secondary" sx={{ py: 2 }}>
                                  No 404 errors — great job!
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Section>

          {/* Data Health */}
          <Section title="Data Health" icon={<BarChart />} defaultOpen={false}>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Grid container spacing={2}>
                  {[
                    {
                      label: 'Latest Event',
                      value: data.dataHealth.latestEventAt
                        ? format(new Date(data.dataHealth.latestEventAt), 'MMM d, h:mm a')
                        : 'No events recorded',
                    },
                    {
                      label: 'Latest Rollup',
                      value: data.dataHealth.latestRollupAt
                        ? format(new Date(data.dataHealth.latestRollupAt), 'MMM d, h:mm a')
                        : 'No rollups yet',
                    },
                    { label: 'Raw Retention', value: `${data.dataHealth.rawRetentionDays} days` },
                  ].map(({ label, value }) => (
                    <Grid key={label} size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {label}
                      </Typography>
                      <Typography variant="body2" fontWeight={500}>
                        {value}
                      </Typography>
                    </Grid>
                  ))}
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Visitor Mode
                    </Typography>
                    <Chip
                      label={
                        data.dataHealth.persistentVisitorIdEnabled
                          ? 'Persistent ID enabled'
                          : 'Session-only (strict privacy)'
                      }
                      size="small"
                      color={data.dataHealth.persistentVisitorIdEnabled ? 'warning' : 'success'}
                      variant="outlined"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Section>

          {/* Privacy Notice */}
          <Alert severity="info">
            <Typography variant="body2">
              <strong>Privacy-focused analytics:</strong> No IP addresses stored. No tracking
              cookies. No third-party scripts. Sessions use anonymous IDs in{' '}
              <code>sessionStorage</code> — they do not persist across browser restarts. Returning
              visitor metrics are unavailable under this strict privacy model.
            </Typography>
          </Alert>
        </Box>
      )}

      {/* Drill-Down Dialog */}
      <Dialog open={drillDownView !== null} onClose={closeDrillDown} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {breadcrumbs.length > 1 && (
              <IconButton
                size="small"
                onClick={() => navigateCrumb(breadcrumbs.length - 2)}
                sx={{ mr: 1 }}
              >
                <ArrowBack fontSize="small" />
              </IconButton>
            )}
            {breadcrumbs.map((crumb, index) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center' }}>
                {index > 0 && (
                  <ChevronRight fontSize="small" sx={{ color: 'text.secondary', mx: 0.5 }} />
                )}
                {index < breadcrumbs.length - 1 ? (
                  <Button
                    size="small"
                    onClick={() => navigateCrumb(index)}
                    sx={{ textTransform: 'none', p: 0.5 }}
                  >
                    {crumb.label}
                  </Button>
                ) : (
                  <Typography variant="h6" component="span">
                    {crumb.label}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
          {currentContext && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {drillDownView === 'page-referrers'
                ? `Page: ${currentContext}`
                : `Referrer: ${currentContext}`}
            </Typography>
          )}
        </DialogTitle>

        <DialogContent>
          {drillDownLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : drillDownData ? (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {drillDownView === 'pages' && (
                        <>
                          <TableCell>Page</TableCell>
                          <TableCell align="right">Views</TableCell>
                          <TableCell align="right">Sessions</TableCell>
                          <TableCell align="center">Referrers</TableCell>
                        </>
                      )}
                      {drillDownView === 'referrers' && (
                        <>
                          <TableCell>Referrer</TableCell>
                          <TableCell align="right">Visits</TableCell>
                          <TableCell align="right">Sessions</TableCell>
                          <TableCell align="right">Last Visit</TableCell>
                          <TableCell align="center">Pages</TableCell>
                        </>
                      )}
                      {drillDownView === '404s' && (
                        <>
                          <TableCell>URL</TableCell>
                          <TableCell align="right">Hits</TableCell>
                          <TableCell>Referrer</TableCell>
                          <TableCell align="right">Last Hit</TableCell>
                        </>
                      )}
                      {(drillDownView === 'page-referrers' ||
                        drillDownView === 'referrer-pages') && (
                        <>
                          <TableCell>
                            {drillDownView === 'page-referrers' ? 'Referrer' : 'Page'}
                          </TableCell>
                          <TableCell align="right">Visits</TableCell>
                          <TableCell align="right">Sessions</TableCell>
                          <TableCell align="right">Last Visit</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {drillDownRows.map((item, index) => (
                      <TableRow key={index} hover>
                        {drillDownView === 'pages' && (
                          <>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>
                                  {item.path as string}
                                </Typography>
                                <IconButton size="small" href={item.path as string} target="_blank">
                                  <OpenInNew fontSize="small" />
                                </IconButton>
                              </Box>
                            </TableCell>
                            <TableCell align="right">
                              {(item.views as number).toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              {(item.uniqueVisitors as number).toLocaleString()}
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title="View referrers for this page">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() =>
                                    navigateNested(
                                      'page-referrers',
                                      item.path as string,
                                      `Referrers → ${item.path as string}`
                                    )
                                  }
                                >
                                  <ChevronRight />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </>
                        )}
                        {drillDownView === 'referrers' && (
                          <>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {getReferrerIcon(item.domain as string)}
                                <Typography variant="body2">{item.domain as string}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell align="right">
                              {(item.visits as number).toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              {(item.uniqueVisitors as number).toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              {format(new Date(item.lastVisit as string), 'MMM d, h:mm a')}
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title="View pages visited from this referrer">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() =>
                                    navigateNested(
                                      'referrer-pages',
                                      item.domain as string,
                                      `Pages → ${item.domain as string}`
                                    )
                                  }
                                >
                                  <ChevronRight />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </>
                        )}
                        {drillDownView === '404s' && (
                          <>
                            <TableCell>
                              <Typography
                                variant="body2"
                                noWrap
                                sx={{ maxWidth: 280, fontFamily: 'monospace', color: 'error.main' }}
                              >
                                {item.path as string}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              {(item.hits as number).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                noWrap
                                sx={{ maxWidth: 160 }}
                              >
                                {(item.referrer as string) || '—'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              {format(new Date(item.lastHit as string), 'MMM d, h:mm a')}
                            </TableCell>
                          </>
                        )}
                        {(drillDownView === 'page-referrers' ||
                          drillDownView === 'referrer-pages') && (
                          <>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>
                                {(item.domain || item.path) as string}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              {(((item.visits || item.views) as number) ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              {((item.uniqueVisitors as number) ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              {format(new Date(item.lastVisit as string), 'MMM d, h:mm a')}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {drillDownData.totalPages > 1 && drillDownRows.length > 0 && (
                <TablePagination
                  component="div"
                  count={drillDownData.total}
                  page={drillDownPage - 1}
                  onPageChange={(_, p) => {
                    setDrillDownPage(p + 1);
                    fetchDrillDown(drillDownView, p + 1, currentContext || undefined);
                  }}
                  rowsPerPage={drillDownData.limit}
                  rowsPerPageOptions={[drillDownData.limit]}
                />
              )}
            </>
          ) : (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No data available
            </Typography>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={closeDrillDown}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
