import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import { computeMarketplaceCacheHealthSummary } from '@/db/marketplace-cache-admin';

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await computeMarketplaceCacheHealthSummary();
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Failed to read marketplace cache health:', error);
    return NextResponse.json(
      {
        error: 'Failed to read marketplace cache health',
        reasonCode: 'marketplace-cache-health-read-failed',
      },
      { status: 500 }
    );
  }
}
