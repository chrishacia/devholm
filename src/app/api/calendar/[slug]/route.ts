import { NextRequest, NextResponse } from 'next/server';
import {
  getCalendarCollectionBySlug,
  listCalendarBlocks,
  listCalendarEventTypes,
} from '@/db/calendar';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  try {
    const calendar = await getCalendarCollectionBySlug(slug, false);
    if (!calendar) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });
    }

    const [blocks, eventTypes] = await Promise.all([
      listCalendarBlocks(calendar.id, { includePrivate: false }),
      listCalendarEventTypes(calendar.id, true),
    ]);

    return NextResponse.json({
      calendar,
      blocks,
      eventTypes,
    });
  } catch (error) {
    console.error('Failed to fetch public calendar:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
  }
}
