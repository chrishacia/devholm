import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runApiExtension } from '@core/lib/extensions.server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const response = await runApiExtension('GET', request, ['admin', 'calendar', id, 'blocks']);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const response = await runApiExtension('POST', request, ['admin', 'calendar', id, 'blocks']);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
