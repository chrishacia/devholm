'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  Grid2 as Grid,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowBack, Delete, Save } from '@mui/icons-material';
import Link from '@/components/common/Link';

interface PageForm {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  status: 'draft' | 'published' | 'archived';
  isEnabled: boolean;
  navLabel: string;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
}

export default function EditCmsPage() {
  const params = useParams();
  const router = useRouter();
  const pageId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PageForm | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/pages/${pageId}`);
        if (!response.ok) {
          throw new Error('Failed to load page');
        }
        const data = await response.json();
        setForm({
          id: data.id,
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt || '',
          contentMarkdown: data.contentMarkdown || '',
          status: data.status,
          isEnabled: Boolean(data.isEnabled),
          navLabel: data.navLabel || '',
          showInMainNav: Boolean(data.showInMainNav),
          showInFooterMain: Boolean(data.showInFooterMain),
          showInFooterResources: Boolean(data.showInFooterResources),
          includeInSitemap: Boolean(data.includeInSitemap),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load page');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [pageId]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          slug: form.slug,
          excerpt: form.excerpt || null,
          content: form.contentMarkdown,
          status: form.status,
          isEnabled: form.isEnabled,
          navLabel: form.navLabel || null,
          showInMainNav: form.showInMainNav,
          showInFooterMain: form.showInFooterMain,
          showInFooterResources: form.showInFooterResources,
          includeInSitemap: form.includeInSitemap,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save page');
      }

      setForm((current) =>
        current ? { ...current, ...data, contentMarkdown: data.contentMarkdown } : current
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this page? This cannot be undone.')) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete page');
      }
      router.push('/admin/pages');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete page');
      setSaving(false);
    }
  };

  if (loading || !form) {
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
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Edit CMS Page
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Update content and visibility for this page.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button component={Link} href="/admin/pages" startIcon={<ArrowBack />}>
            Back
          </Button>
          <Button
            color="error"
            variant="outlined"
            startIcon={<Delete />}
            onClick={remove}
            disabled={saving}
          >
            Delete
          </Button>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={save}
            disabled={saving || !form.title || !form.contentMarkdown}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              <TextField
                fullWidth
                label="Title"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Slug"
                value={form.slug}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, slug: e.target.value } : prev))
                }
                helperText={`URL: /${form.slug}`}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Excerpt"
                value={form.excerpt}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, excerpt: e.target.value } : prev))
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={16}
                label="Content (Markdown)"
                value={form.contentMarkdown}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, contentMarkdown: e.target.value } : prev))
                }
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card>
            <CardContent>
              <TextField
                fullWidth
                select
                label="Status"
                value={form.status}
                onChange={(e) =>
                  setForm((prev) =>
                    prev ? { ...prev, status: e.target.value as PageForm['status'] } : prev
                  )
                }
                sx={{ mb: 2 }}
              >
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="published">Published</MenuItem>
                <MenuItem value="archived">Archived</MenuItem>
              </TextField>

              <TextField
                fullWidth
                label="Navigation Label"
                value={form.navLabel}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, navLabel: e.target.value } : prev))
                }
                sx={{ mb: 2 }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={form.isEnabled}
                    onChange={(e) =>
                      setForm((prev) => (prev ? { ...prev, isEnabled: e.target.checked } : prev))
                    }
                  />
                }
                label="Enabled"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.showInMainNav}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, showInMainNav: e.target.checked } : prev
                      )
                    }
                  />
                }
                label="Show in Main Navigation"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.showInFooterMain}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, showInFooterMain: e.target.checked } : prev
                      )
                    }
                  />
                }
                label="Show in Footer: Pages"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.showInFooterResources}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, showInFooterResources: e.target.checked } : prev
                      )
                    }
                  />
                }
                label="Show in Footer: Resources"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.includeInSitemap}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, includeInSitemap: e.target.checked } : prev
                      )
                    }
                  />
                }
                label="Include in Sitemap"
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
