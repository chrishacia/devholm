import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createCalendarBooking,
  getCalendarCollectionBySlug,
  listCalendarBlocks,
  listCalendarEventTypes,
} from '@/db/calendar';
import { isPluginEnabled } from '@/db/plugins';
import { getClientIp } from '@/lib/rate-limiter';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const bookingSchema = z.object({
  eventTypeId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(180),
  email: z.string().email().max(255),
  title: z.string().min(3).max(220),
  notes: z.string().max(2000).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await isPluginEnabled('calendar').catch(() => false))) {
    return NextResponse.json({ error: 'Calendar plugin is disabled' }, { status: 404 });
  }

  const { slug } = await params;

  try {
    const calendar = await getCalendarCollectionBySlug(slug, false);
    if (!calendar || calendar.mode !== 'booking') {
      return NextResponse.json({ error: 'Booking unavailable for this calendar' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = bookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const start = new Date(parsed.data.startsAt);
    const end = new Date(parsed.data.endsAt);

    if (end.getTime() <= start.getTime()) {
      return NextResponse.json({ error: 'Invalid booking time range' }, { status: 400 });
    }

    const [blocks, eventTypes] = await Promise.all([
      listCalendarBlocks(calendar.id, { includePrivate: true }),
      listCalendarEventTypes(calendar.id, true),
    ]);

    const eventType = parsed.data.eventTypeId
      ? eventTypes.find((item) => item.id === parsed.data.eventTypeId)
      : null;

    if (parsed.data.eventTypeId && !eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 400 });
    }

    const conflict = blocks.some((block) =>
      overlaps(start, end, new Date(block.startsAt), new Date(block.endsAt))
    );

    if (conflict) {
      return NextResponse.json({ error: 'Requested slot is unavailable' }, { status: 409 });
    }

    const created = await createCalendarBooking({
      calendarId: calendar.id,
      eventTypeId: parsed.data.eventTypeId || null,
      name: parsed.data.name,
      email: parsed.data.email,
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      startsAt: start,
      endsAt: end,
      source: 'public',
      sourceIp: getClientIp(request),
    });

    return NextResponse.json({ booking: created }, { status: 201 });
  } catch (error) {
    console.error('Failed to create booking:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
