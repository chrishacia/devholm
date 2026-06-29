import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteCalendarEventType, updateCalendarEventType } from '@/db/calendar';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ eventTypeId: string }>;
}

const eventTypeSchema = z.object({
  calendarId: z.string().uuid(),
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

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { eventTypeId } = await params;

  try {
    const body = await request.json();
    const parsed = eventTypeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateCalendarEventType(eventTypeId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update event type:', error);
    const message = error instanceof Error ? error.message : 'Failed to update event type';
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') ? 400 : 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { eventTypeId } = await params;

  try {
    const deleted = await deleteCalendarEventType(eventTypeId);
    if (!deleted) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete event type:', error);
    return NextResponse.json({ error: 'Failed to delete event type' }, { status: 500 });
  }
}
