import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import { getMarketplaceAdminPlugin } from '@core/lib/plugin-marketplace-admin.server';

interface RouteContext {
  params: Promise<{
    pluginId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { pluginId } = await context.params;
  if (!pluginId?.trim()) {
    return NextResponse.json(
      { error: 'pluginId is required', reasonCode: 'plugin-id-required' },
      { status: 400 }
    );
  }

  try {
    const plugin = await getMarketplaceAdminPlugin(pluginId.trim());
    if (!plugin) {
      return NextResponse.json(
        { error: 'Marketplace plugin not found', reasonCode: 'plugin-not-found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ plugin });
  } catch (error) {
    console.error('Failed to fetch marketplace plugin detail:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch marketplace plugin detail',
        reasonCode: 'marketplace-plugin-read-failed',
      },
      { status: 500 }
    );
  }
}
