import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runApiExtension } from '@core/lib/extensions.server';

type RouteParams = {
  params: Promise<{ path: string[] }>;
};

async function dispatch(
  method: 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT',
  request: NextRequest,
  { params }: RouteParams
) {
  const { path } = await params;

  try {
    const response = await runApiExtension(method, request, path);
    if (response) {
      return response;
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error(`Extension API ${method} /api/${path.join('/')} failed:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export function GET(request: NextRequest, context: RouteParams) {
  return dispatch('GET', request, context);
}

export function POST(request: NextRequest, context: RouteParams) {
  return dispatch('POST', request, context);
}

export function PUT(request: NextRequest, context: RouteParams) {
  return dispatch('PUT', request, context);
}

export function PATCH(request: NextRequest, context: RouteParams) {
  return dispatch('PATCH', request, context);
}

export function DELETE(request: NextRequest, context: RouteParams) {
  return dispatch('DELETE', request, context);
}

export function OPTIONS(request: NextRequest, context: RouteParams) {
  return dispatch('OPTIONS', request, context);
}

export function HEAD(request: NextRequest, context: RouteParams) {
  return dispatch('HEAD', request, context);
}
