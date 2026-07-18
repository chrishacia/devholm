import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runApiExtension } from '@core/lib/extensions.server';

export async function GET(request: NextRequest) {
  const response = await runApiExtension('GET', request, ['admin', 'calendar']);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const response = await runApiExtension('POST', request, ['admin', 'calendar']);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
