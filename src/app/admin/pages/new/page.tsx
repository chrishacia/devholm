'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Grid2 as Grid,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowBack, Save } from '@mui/icons-material';
import Link from '@/components/common/Link';

interface PageForm {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
  isEnabled: boolean;
  navLabel: string;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
}

const initialForm: PageForm = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  status: 'draft',
  isEnabled: true,
  navLabel: '',
  showInMainNav: false,
  showInFooterMain: false,
  showInFooterResources: false,
  includeInSitemap: true,
};

function createSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function NewCmsPage() {
  const router = useRouter();
  const [form, setForm] = useState<PageForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          slug: form.slug || createSlug(form.title),
          excerpt: form.excerpt || null,
          navLabel: form.navLabel || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create page');
      }

      router.push(`/admin/pages/${data.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            New CMS Page
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create a dynamic page managed in admin with markdown content.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button component={Link} href="/admin/pages" startIcon={<ArrowBack />}>
            Back
          </Button>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={save}
            disabled={saving || !form.title || !form.content}
          >
            {saving ? 'Saving...' : 'Create'}
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
                  setForm((prev) => ({
                    ...prev,
                    title: e.target.value,
                    slug: prev.slug || createSlug(e.target.value),
                  }))
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Slug"
                value={form.slug}
                onChange={(e) => setForm((prev) => ({ ...prev, slug: createSlug(e.target.value) }))}
                helperText={`URL: /${form.slug || createSlug(form.title) || 'your-page'}`}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Excerpt"
                value={form.excerpt}
                onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={16}
                label="Content (Markdown)"
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card>
            <CardContent>
              <TextField
                fullWidth
                label="Status"
                select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value as PageForm['status'],
                  }))
                }
                sx={{ mb: 2 }}
              >
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="published">Published</MenuItem>
                <MenuItem value="archived">Archived</MenuItem>
              </TextField>

              <TextField
                fullWidth
                label="Navigation Label (optional)"
                value={form.navLabel}
                onChange={(e) => setForm((prev) => ({ ...prev, navLabel: e.target.value }))}
                sx={{ mb: 2 }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={form.isEnabled}
                    onChange={(e) => setForm((prev) => ({ ...prev, isEnabled: e.target.checked }))}
                  />
                }
                label="Enabled"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.showInMainNav}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, showInMainNav: e.target.checked }))
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
                      setForm((prev) => ({ ...prev, showInFooterMain: e.target.checked }))
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
                      setForm((prev) => ({ ...prev, showInFooterResources: e.target.checked }))
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
                      setForm((prev) => ({ ...prev, includeInSitemap: e.target.checked }))
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
