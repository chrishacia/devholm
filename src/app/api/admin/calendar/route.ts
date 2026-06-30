import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { createCalendarCollection, listCalendarCollections } from '@/db/calendar';

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

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const calendars = await listCalendarCollections();
    return NextResponse.json({ calendars });
  } catch (error) {
    console.error('Failed to list calendars:', error);
    return NextResponse.json({ error: 'Failed to fetch calendars' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = calendarSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = await createCalendarCollection({
      ...parsed.data,
      ownerUserId: token.id as string,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create calendar:', error);
    const message = error instanceof Error ? error.message : 'Failed to create calendar';
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') ? 400 : 500 }
    );
  }
}
