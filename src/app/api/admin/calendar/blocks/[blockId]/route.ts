import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteCalendarBlock, updateCalendarBlock } from '@/db/calendar';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ blockId: string }>;
}

const blockSchema = z.object({
  calendarId: z.string().uuid(),
  title: z.string().min(2).max(220),
  description: z.string().max(2000).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isPublic: z.boolean().default(false),
  allDay: z.boolean().default(false),
  displayColor: z.string().max(20).nullable().optional(),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { blockId } = await params;

  try {
    const body = await request.json();
    const parsed = blockSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateCalendarBlock(blockId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Calendar block not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update calendar block:', error);
    return NextResponse.json({ error: 'Failed to update calendar block' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { blockId } = await params;

  try {
    const deleted = await deleteCalendarBlock(blockId);
    if (!deleted) {
      return NextResponse.json({ error: 'Calendar block not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete calendar block:', error);
    return NextResponse.json({ error: 'Failed to delete calendar block' }, { status: 500 });
  }
}
