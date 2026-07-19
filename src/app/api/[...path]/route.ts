import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveApiExtension, runApiExtension } from '@core/lib/extensions.server';
import { isPluginEnabled } from '@/db/plugins';

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

    // Keep disabled plugin API paths explicit instead of returning opaque 404s.
    const extension = resolveApiExtension(path);
    if (extension?.pluginId) {
      const enabled = await isPluginEnabled(extension.pluginId).catch(() => false);
      if (!enabled) {
        return NextResponse.json(
          {
            error: 'Plugin API is disabled',
            code: 'PLUGIN_DISABLED',
            pluginId: extension.pluginId,
            path: `/api/${path.join('/')}`,
            message: 'This API is unavailable until the plugin is re-enabled in Plugin Management.',
          },
          { status: 404 }
        );
      }
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
