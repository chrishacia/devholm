'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Delete, Refresh } from '@mui/icons-material';

interface GalleryCollection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  layout: string;
  isPrivate: boolean;
  isEnabled: boolean;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  layout: string;
  isPrivate: boolean;
  isEnabled: boolean;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
}

const DEFAULT_FORM: FormState = {
  name: '',
  slug: '',
  description: '',
  layout: 'masonry',
  isPrivate: false,
  isEnabled: true,
  showInMainNav: false,
  showInFooterMain: false,
  showInFooterResources: false,
  includeInSitemap: false,
};

export default function AdminGalleryPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [galleries, setGalleries] = useState<GalleryCollection[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const fetchGalleries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/gallery');
      if (!res.ok) throw new Error('Failed to fetch galleries');
      const data = await res.json();
      setGalleries(data.galleries || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load galleries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGalleries();
  }, [fetchGalleries]);

  const reset = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setOpen(false);
  };

  const onCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setOpen(true);
  };

  const onEdit = (gallery: GalleryCollection) => {
    setEditingId(gallery.id);
    setForm({
      name: gallery.name,
      slug: gallery.slug,
      description: gallery.description || '',
      layout: gallery.layout,
      isPrivate: gallery.isPrivate,
      isEnabled: gallery.isEnabled,
      showInMainNav: gallery.showInMainNav,
      showInFooterMain: gallery.showInFooterMain,
      showInFooterResources: gallery.showInFooterResources,
      includeInSitemap: gallery.includeInSitemap,
    });
    setOpen(true);
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this gallery and all of its items?')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/gallery/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete gallery');
      await fetchGalleries();
    } catch (err) {
      console.error(err);
      setError('Failed to delete gallery');
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        description: form.description || null,
        layout: form.layout,
        isPrivate: form.isPrivate,
        isEnabled: form.isEnabled,
        showInMainNav: form.showInMainNav,
        showInFooterMain: form.showInFooterMain,
        showInFooterResources: form.showInFooterResources,
        includeInSitemap: form.includeInSitemap,
      };

      const url = editingId ? `/api/admin/gallery/${editingId}` : '/api/admin/gallery';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save gallery');
      }

      reset();
      await fetchGalleries();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save gallery');
    } finally {
      setSaving(false);
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
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        sx={{ mb: 3 }}
        gap={2}
      >
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Gallery Plugin
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create image/video galleries and embed with shortcode: [gallery
            slug=&quot;your-slug&quot;].
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={fetchGalleries}>
            Refresh
          </Button>
          <Button variant="contained" onClick={onCreate}>
            New Gallery
          </Button>
        </Stack>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Slug</TableCell>
                <TableCell>Layout</TableCell>
                <TableCell>Visibility</TableCell>
                <TableCell>Nav/Footer</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {galleries.map((gallery) => (
                <TableRow key={gallery.id}>
                  <TableCell>
                    <Typography fontWeight={600}>{gallery.name}</Typography>
                    {gallery.description ? (
                      <Typography variant="caption" color="text.secondary">
                        {gallery.description}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>/gallery/{gallery.slug}</TableCell>
                  <TableCell>{gallery.layout}</TableCell>
                  <TableCell>
                    {gallery.isPrivate ? 'Private' : 'Public'} /{' '}
                    {gallery.isEnabled ? 'Enabled' : 'Disabled'}
                  </TableCell>
                  <TableCell>
                    {[
                      gallery.showInMainNav && 'Main',
                      gallery.showInFooterMain && 'Footer: Pages',
                      gallery.showInFooterResources && 'Footer: Resources',
                      gallery.includeInSitemap && 'Sitemap',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'None'}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => onEdit(gallery)}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<Delete />}
                      onClick={() => onDelete(gallery.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {galleries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary">No galleries yet.</Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={open} onClose={reset} fullWidth maxWidth="md">
        <DialogTitle>{editingId ? 'Edit Gallery' : 'Create Gallery'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm((curr) => ({ ...curr, name: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Slug"
              helperText="Optional: auto-generated from name when empty"
              value={form.slug}
              onChange={(e) => setForm((curr) => ({ ...curr, slug: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((curr) => ({ ...curr, description: e.target.value }))}
              multiline
              minRows={3}
              fullWidth
            />
            <TextField
              label="Layout"
              select
              value={form.layout}
              onChange={(e) => setForm((curr) => ({ ...curr, layout: e.target.value }))}
              fullWidth
            >
              <MenuItem value="masonry">Masonry</MenuItem>
              <MenuItem value="grid">Grid</MenuItem>
              <MenuItem value="carousel">Carousel</MenuItem>
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.isPrivate}
                    onChange={(e) => setForm((curr) => ({ ...curr, isPrivate: e.target.checked }))}
                  />
                }
                label="Private"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.isEnabled}
                    onChange={(e) => setForm((curr) => ({ ...curr, isEnabled: e.target.checked }))}
                  />
                }
                label="Enabled"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.showInMainNav}
                    onChange={(e) =>
                      setForm((curr) => ({ ...curr, showInMainNav: e.target.checked }))
                    }
                  />
                }
                label="Main Nav"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.showInFooterMain}
                    onChange={(e) =>
                      setForm((curr) => ({ ...curr, showInFooterMain: e.target.checked }))
                    }
                  />
                }
                label="Footer Main"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.showInFooterResources}
                    onChange={(e) =>
                      setForm((curr) => ({ ...curr, showInFooterResources: e.target.checked }))
                    }
                  />
                }
                label="Footer Resources"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.includeInSitemap}
                    onChange={(e) =>
                      setForm((curr) => ({ ...curr, includeInSitemap: e.target.checked }))
                    }
                  />
                }
                label="Sitemap"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={reset}>Cancel</Button>
          <Button onClick={onSave} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
