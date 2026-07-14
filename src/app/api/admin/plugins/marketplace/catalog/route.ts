import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import { listMarketplaceAdminPlugins } from '@core/lib/plugin-marketplace-admin.server';

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const plugins = await listMarketplaceAdminPlugins();
    return NextResponse.json({
      plugins,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to fetch marketplace catalog:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch marketplace catalog',
        reasonCode: 'marketplace-catalog-read-failed',
      },
      { status: 500 }
    );
  }
}
