import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCalendarBlock, listCalendarBlocks } from '@/db/calendar';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const blockSchema = z.object({
  title: z.string().min(2).max(220),
  description: z.string().max(2000).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isPublic: z.boolean().default(false),
  allDay: z.boolean().default(false),
  displayColor: z.string().max(20).nullable().optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const blocks = await listCalendarBlocks(id, { includePrivate: true });
    return NextResponse.json({ blocks });
  } catch (error) {
    console.error('Failed to list calendar blocks:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar blocks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = blockSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = await createCalendarBlock({ calendarId: id, ...parsed.data });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create calendar block:', error);
    return NextResponse.json({ error: 'Failed to create calendar block' }, { status: 500 });
  }
}
