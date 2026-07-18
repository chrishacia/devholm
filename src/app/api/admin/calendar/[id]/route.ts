import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runApiExtension } from '@core/lib/extensions.server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const response = await runApiExtension('GET', request, ['admin', 'calendar', id]);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const response = await runApiExtension('PUT', request, ['admin', 'calendar', id]);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const response = await runApiExtension('DELETE', request, ['admin', 'calendar', id]);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
