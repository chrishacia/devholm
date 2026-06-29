import { notFound } from 'next/navigation';
import { Box, Card, Chip, Container, Stack, Typography } from '@mui/material';
import { AuthAwareMainLayout } from '@/components';
import {
  getCalendarCollectionBySlug,
  listCalendarBlocks,
  listCalendarEventTypes,
} from '@/db/calendar';
import BookingClient from './BookingClient';

type Props = {
  params: Promise<{ slug: string }>;
};

function fmt(value: Date | string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function CalendarPublicPage({ params }: Props) {
  const { slug } = await params;
  const calendar = await getCalendarCollectionBySlug(slug, false);

  if (!calendar) {
    notFound();
  }

  const [blocks, eventTypes] = await Promise.all([
    listCalendarBlocks(calendar.id, { includePrivate: false }),
    listCalendarEventTypes(calendar.id, true),
  ]);

  return (
    <AuthAwareMainLayout
      breadcrumbs={[{ label: 'Calendar', href: '/calendar' }, { label: calendar.name }]}
    >
      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h3" component="h1" fontWeight={800}>
            {calendar.embedTitle || calendar.name}
          </Typography>
          {calendar.description ? (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              {calendar.description}
            </Typography>
          ) : null}
        </Box>

        {calendar.mode === 'booking' ? (
          <>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 3 }}>
              {eventTypes.map((eventType) => (
                <Chip
                  key={eventType.id}
                  label={`${eventType.name} · ${eventType.durationMinutes}m`}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Stack>
            <BookingClient
              calendarSlug={calendar.slug}
              eventTypes={eventTypes.map((eventType) => ({
                id: eventType.id,
                name: eventType.name,
                durationMinutes: eventType.durationMinutes,
                description: eventType.description,
              }))}
            />
          </>
        ) : (
          <Stack spacing={2}>
            {blocks.length === 0 ? (
              <Typography color="text.secondary">No upcoming entries.</Typography>
            ) : null}
            {blocks.map((block) => (
              <Card key={block.id} variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="h6" fontWeight={700}>
                  {block.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {fmt(block.startsAt)} - {fmt(block.endsAt)}
                </Typography>
                {block.description ? (
                  <Typography variant="body1">{block.description}</Typography>
                ) : null}
              </Card>
            ))}
          </Stack>
        )}
      </Container>
    </AuthAwareMainLayout>
  );
}
