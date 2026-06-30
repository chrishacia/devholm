import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteCalendarCollection,
  getCalendarCollectionById,
  updateCalendarCollection,
} from '@/db/calendar';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const calendarSchema = z.object({
  name: z.string().min(2).max(180),
  slug: z.string().min(1).max(220).optional(),
  description: z.string().max(2000).nullable().optional(),
  mode: z.enum(['display', 'booking']).default('display'),
  isPrivate: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  timezone: z.string().min(2).max(100).default('UTC'),
  embedTitle: z.string().max(220).nullable().optional(),
  showInMainNav: z.boolean().default(false),
  showInFooterMain: z.boolean().default(false),
  showInFooterResources: z.boolean().default(false),
  includeInSitemap: z.boolean().default(false),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const calendar = await getCalendarCollectionById(id);
    if (!calendar) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });
    }

    return NextResponse.json(calendar);
  } catch (error) {
    console.error('Failed to fetch calendar:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = calendarSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateCalendarCollection(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update calendar:', error);
    const message = error instanceof Error ? error.message : 'Failed to update calendar';
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') ? 400 : 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const deleted = await deleteCalendarCollection(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete calendar:', error);
    return NextResponse.json({ error: 'Failed to delete calendar' }, { status: 500 });
  }
}
