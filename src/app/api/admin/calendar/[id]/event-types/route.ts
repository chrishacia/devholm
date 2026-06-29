import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCalendarEventType, listCalendarEventTypes } from '@/db/calendar';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const eventTypeSchema = z.object({
  name: z.string().min(2).max(180),
  slug: z.string().min(1).max(220).optional(),
  description: z.string().max(2000).nullable().optional(),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  bufferBeforeMinutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(0),
  bufferAfterMinutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(0),
  locationType: z.string().min(2).max(80).default('custom'),
  locationValue: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
  availabilityRules: z.unknown().optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const eventTypes = await listCalendarEventTypes(id, false);
    return NextResponse.json({ eventTypes });
  } catch (error) {
    console.error('Failed to list event types:', error);
    return NextResponse.json({ error: 'Failed to fetch event types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = eventTypeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = await createCalendarEventType({
      ...parsed.data,
      calendarId: id,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create event type:', error);
    const message = error instanceof Error ? error.message : 'Failed to create event type';
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') ? 400 : 500 }
    );
  }
}
