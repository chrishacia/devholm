'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
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
import { Delete, Refresh, Save } from '@mui/icons-material';

interface CalendarCollection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mode: 'display' | 'booking';
  isPrivate: boolean;
  isEnabled: boolean;
  timezone: string;
  embedTitle: string | null;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  mode: 'display' | 'booking';
  isPrivate: boolean;
  isEnabled: boolean;
  timezone: string;
  embedTitle: string;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
}

const DEFAULT_FORM: FormState = {
  name: '',
  slug: '',
  description: '',
  mode: 'display',
  isPrivate: false,
  isEnabled: true,
  timezone: 'UTC',
  embedTitle: '',
  showInMainNav: false,
  showInFooterMain: false,
  showInFooterResources: false,
  includeInSitemap: false,
};

function toFormState(item: CalendarCollection): FormState {
  return {
    name: item.name,
    slug: item.slug,
    description: item.description || '',
    mode: item.mode,
    isPrivate: item.isPrivate,
    isEnabled: item.isEnabled,
    timezone: item.timezone,
    embedTitle: item.embedTitle || '',
    showInMainNav: item.showInMainNav,
    showInFooterMain: item.showInFooterMain,
    showInFooterResources: item.showInFooterResources,
    includeInSitemap: item.includeInSitemap,
  };
}

function fromFormState(form: FormState) {
  return {
    name: form.name,
    slug: form.slug || undefined,
    description: form.description || null,
    mode: form.mode,
    isPrivate: form.isPrivate,
    isEnabled: form.isEnabled,
    timezone: form.timezone,
    embedTitle: form.embedTitle || null,
    showInMainNav: form.showInMainNav,
    showInFooterMain: form.showInFooterMain,
    showInFooterResources: form.showInFooterResources,
    includeInSitemap: form.includeInSitemap,
  };
}

export default function AdminCalendarPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<CalendarCollection[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const modeLabel = useMemo(() => (form.mode === 'booking' ? 'Booking' : 'Display'), [form.mode]);

  const fetchCalendars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/calendar');
      if (!res.ok) {
        throw new Error('Failed to fetch calendars');
      }
      const data = await res.json();
      setCalendars(data.calendars || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load calendars');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendars();
  }, [fetchCalendars]);

  const onCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setOpen(true);
  };

  const onEdit = (calendar: CalendarCollection) => {
    setEditingId(calendar.id);
    setForm(toFormState(calendar));
    setOpen(true);
  };

  const onDelete = async (id: string) => {
    if (
      !window.confirm('Delete this calendar? This also removes blocks, event types, and bookings.')
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/calendar/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete calendar');
      await fetchCalendars();
    } catch (err) {
      console.error(err);
      setError('Failed to delete calendar');
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = fromFormState(form);
      const url = editingId ? `/api/admin/calendar/${editingId}` : '/api/admin/calendar';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save calendar');
      }

      setOpen(false);
      setForm(DEFAULT_FORM);
      setEditingId(null);
      await fetchCalendars();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save calendar');
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
            Calendar Plugin
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage display calendars and booking calendars. Use shortcode: [calendar
            slug=&quot;your-slug&quot;].
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={fetchCalendars}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<Save />} onClick={onCreate}>
            New Calendar
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
                <TableCell>Mode</TableCell>
                <TableCell>Visibility</TableCell>
                <TableCell>Nav/Footer</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {calendars.map((calendar) => (
                <TableRow key={calendar.id}>
                  <TableCell>
                    <Typography fontWeight={600}>{calendar.name}</Typography>
                    {calendar.description ? (
                      <Typography variant="caption" color="text.secondary">
                        {calendar.description}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>/calendar/{calendar.slug}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={calendar.mode}
                      color={calendar.mode === 'booking' ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {calendar.isPrivate ? 'Private' : 'Public'} /{' '}
                    {calendar.isEnabled ? 'Enabled' : 'Disabled'}
                  </TableCell>
                  <TableCell>
                    {[
                      calendar.showInMainNav && 'Main',
                      calendar.showInFooterMain && 'Footer: Pages',
                      calendar.showInFooterResources && 'Footer: Resources',
                      calendar.includeInSitemap && 'Sitemap',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'None'}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => onEdit(calendar)}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<Delete />}
                      onClick={() => onDelete(calendar.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {calendars.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary">No calendars yet.</Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingId ? 'Edit Calendar' : 'Create Calendar'}</DialogTitle>
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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Mode"
                select
                value={form.mode}
                onChange={(e) =>
                  setForm((curr) => ({ ...curr, mode: e.target.value as FormState['mode'] }))
                }
                fullWidth
              >
                <MenuItem value="display">Display</MenuItem>
                <MenuItem value="booking">Booking</MenuItem>
              </TextField>
              <TextField
                label="Timezone"
                value={form.timezone}
                onChange={(e) => setForm((curr) => ({ ...curr, timezone: e.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Embed Title"
              helperText={`Shown in shortcode output (${modeLabel} mode)`}
              value={form.embedTitle}
              onChange={(e) => setForm((curr) => ({ ...curr, embedTitle: e.target.value }))}
              fullWidth
            />
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
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={onSave} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
