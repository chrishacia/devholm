'use client';

import { useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';

interface EventType {
  id: string;
  name: string;
  durationMinutes: number;
  description: string | null;
}

interface BookingClientProps {
  calendarSlug: string;
  eventTypes: EventType[];
}

export default function BookingClient({ calendarSlug, eventTypes }: BookingClientProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [eventTypeId, setEventTypeId] = useState<string | null>(eventTypes[0]?.id || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedType = useMemo(
    () => eventTypes.find((item) => item.id === eventTypeId) || null,
    [eventTypeId, eventTypes]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!date || !time) {
      setError('Select date and start time first.');
      return;
    }

    const startsAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startsAt.getTime())) {
      setError('Invalid date/time.');
      return;
    }

    const duration = selectedType?.durationMinutes || 30;
    const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);

    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/${calendarSlug}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypeId,
          name,
          email,
          title,
          notes,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create booking');
      }

      setSuccess('Booking request submitted. You can review it in admin.');
      setTitle('');
      setNotes('');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to submit booking');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box component="form" onSubmit={onSubmit} sx={{ mt: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        Request a booking
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose an event type and preferred time. This request is submitted for confirmation.
      </Typography>

      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
        {eventTypes.map((item) => (
          <Chip
            key={item.id}
            label={`${item.name} (${item.durationMinutes}m)`}
            color={eventTypeId === item.id ? 'primary' : 'default'}
            onClick={() => setEventTypeId(item.id)}
            clickable
          />
        ))}
      </Stack>

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Your email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
          />
        </Stack>

        <TextField
          label="Booking title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          fullWidth
        />

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            type="date"
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
          />
          <TextField
            type="time"
            label="Start time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
          />
        </Stack>

        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          minRows={3}
          fullWidth
        />

        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? 'Submitting...' : 'Submit Booking Request'}
        </Button>
      </Stack>
    </Box>
  );
}
