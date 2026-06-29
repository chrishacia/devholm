'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Edit, Save } from '@mui/icons-material';
import Link from '@/components/common/Link';

interface CmsPage {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  isEnabled: boolean;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
  updatedAt: string;
}

interface DevPage {
  pageKey: string;
  path: string;
  title: string;
  navLabel: string | null;
  isEnabled: boolean;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
}

const statusColor: Record<CmsPage['status'], 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

export default function AdminPagesListPage() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingDev, setSavingDev] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cmsPages, setCmsPages] = useState<CmsPage[]>([]);
  const [devPages, setDevPages] = useState<DevPage[]>([]);
  const [devDraft, setDevDraft] = useState<DevPage[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cmsRes, devRes] = await Promise.all([
        fetch('/api/admin/pages?limit=200'),
        fetch('/api/admin/dev-pages'),
      ]);

      if (!cmsRes.ok || !devRes.ok) {
        throw new Error('Failed to fetch pages');
      }

      const cmsData = await cmsRes.json();
      const devData = await devRes.json();

      setCmsPages(cmsData.pages || []);
      setDevPages(devData.pages || []);
      setDevDraft(devData.pages || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const hasDevChanges = useMemo(
    () => JSON.stringify(devPages) !== JSON.stringify(devDraft),
    [devPages, devDraft]
  );

  const updateDev = (pageKey: string, patch: Partial<DevPage>) => {
    setDevDraft((current) =>
      current.map((row) => (row.pageKey === pageKey ? { ...row, ...patch } : row))
    );
  };

  const saveDevPages = async () => {
    setSavingDev(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/dev-pages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: devDraft }),
      });

      if (!response.ok) {
        throw new Error('Failed to save dev pages');
      }

      const data = await response.json();
      setDevPages(data.pages || []);
      setDevDraft(data.pages || []);
    } catch (err) {
      console.error(err);
      setError('Failed to save dev page toggles');
    } finally {
      setSavingDev(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Pages
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage CMS pages and developer-defined page toggles.
          </Typography>
        </Box>

        {tab === 0 ? (
          <Button component={Link} href="/admin/pages/new" variant="contained" startIcon={<Add />}>
            New CMS Page
          </Button>
        ) : (
          <Button
            variant="contained"
            startIcon={<Save />}
            disabled={!hasDevChanges || savingDev}
            onClick={saveDevPages}
          >
            {savingDev ? 'Saving...' : 'Save Dev Page Toggles'}
          </Button>
        )}
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="CMS Pages" />
          <Tab label="Dev Pages" />
        </Tabs>

        {tab === 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Slug</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Enabled</TableCell>
                  <TableCell>Nav/Footer</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cmsPages.map((page) => (
                  <TableRow key={page.id}>
                    <TableCell>{page.title}</TableCell>
                    <TableCell>/{page.slug}</TableCell>
                    <TableCell>
                      <Chip size="small" label={page.status} color={statusColor[page.status]} />
                    </TableCell>
                    <TableCell>{page.isEnabled ? 'On' : 'Off'}</TableCell>
                    <TableCell>
                      {[
                        page.showInMainNav && 'Main',
                        page.showInFooterMain && 'Footer: Pages',
                        page.showInFooterResources && 'Footer: Resources',
                      ]
                        .filter(Boolean)
                        .join(', ') || 'None'}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        component={Link}
                        href={`/admin/pages/${page.id}/edit`}
                        size="small"
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {cmsPages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography color="text.secondary">No CMS pages yet.</Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Page</TableCell>
                  <TableCell>Path</TableCell>
                  <TableCell>Nav Label</TableCell>
                  <TableCell>Enabled</TableCell>
                  <TableCell>Main Nav</TableCell>
                  <TableCell>Footer Pages</TableCell>
                  <TableCell>Footer Resources</TableCell>
                  <TableCell>Sitemap</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devDraft.map((page) => (
                  <TableRow key={page.pageKey}>
                    <TableCell>{page.title}</TableCell>
                    <TableCell>{page.path}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={page.navLabel || ''}
                        onChange={(e) =>
                          updateDev(page.pageKey, { navLabel: e.target.value || null })
                        }
                        placeholder={page.title}
                      />
                    </TableCell>
                    <TableCell>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={page.isEnabled}
                            onChange={(e) =>
                              updateDev(page.pageKey, { isEnabled: e.target.checked })
                            }
                          />
                        }
                        label=""
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={page.showInMainNav}
                        onChange={(e) =>
                          updateDev(page.pageKey, { showInMainNav: e.target.checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={page.showInFooterMain}
                        onChange={(e) =>
                          updateDev(page.pageKey, { showInFooterMain: e.target.checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={page.showInFooterResources}
                        onChange={(e) =>
                          updateDev(page.pageKey, { showInFooterResources: e.target.checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={page.includeInSitemap}
                        onChange={(e) =>
                          updateDev(page.pageKey, { includeInSitemap: e.target.checked })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {devDraft.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography color="text.secondary">
                        No dev pages are registered yet. Add entries in
                        src/user/extensions/pages/index.ts.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Box>
  );
}
