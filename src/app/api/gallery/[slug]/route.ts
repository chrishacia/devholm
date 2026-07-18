import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runApiExtension } from '@core/lib/extensions.server';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  const response = await runApiExtension('GET', request, ['gallery', slug]);
  if (response) {
    return response;
  }

  return NextResponse.json({ error: 'Gallery plugin is disabled' }, { status: 404 });
}
