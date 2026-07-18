import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runApiExtension } from '@core/lib/extensions.server';

interface RouteParams {
  params: Promise<{ eventTypeId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { eventTypeId } = await params;

  const response = await runApiExtension('PUT', request, [
    'admin',
    'calendar',
    'event-types',
    eventTypeId,
  ]);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { eventTypeId } = await params;

  const response = await runApiExtension('DELETE', request, [
    'admin',
    'calendar',
    'event-types',
    eventTypeId,
  ]);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
