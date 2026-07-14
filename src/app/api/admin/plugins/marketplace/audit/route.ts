import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import {
  getLatestMarketplaceIntegrityAuditRun,
  listMarketplaceCacheEntries,
  startMarketplaceIntegrityAuditRun,
  completeMarketplaceIntegrityAuditRun,
} from '@/db/marketplace-cache-admin';

const auditSchema = z.object({
  mode: z.enum(['start']).default('start'),
});

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const latest = await getLatestMarketplaceIntegrityAuditRun();
    return NextResponse.json({ latest });
  } catch (error) {
    console.error('Failed to read latest marketplace audit run:', error);
    return NextResponse.json(
      {
        error: 'Failed to read latest marketplace audit run',
        reasonCode: 'marketplace-cache-audit-read-failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = auditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid audit payload',
          reasonCode: 'marketplace-cache-audit-invalid',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const startedBy =
      (typeof token.email === 'string' && token.email) ||
      (typeof token.sub === 'string' && token.sub) ||
      (typeof token.name === 'string' && token.name) ||
      undefined;

    const run = await startMarketplaceIntegrityAuditRun(startedBy);
    const entries = await listMarketplaceCacheEntries();

    const staleCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const findingsStale = entries.filter(
      (entry) => Date.parse(entry.lastAccessedAt) < staleCutoff
    ).length;
    const findingsCorrupt = entries.filter((entry) => entry.integrityState === 'corrupt').length;
    const findingsMissing = entries.filter((entry) => entry.integrityState === 'missing').length;
    const findingsTotal = findingsStale + findingsCorrupt + findingsMissing;

    const completed = await completeMarketplaceIntegrityAuditRun({
      runId: run.runId,
      status: 'succeeded',
      scannedEntries: entries.length,
      findingsTotal,
      findingsCorrupt,
      findingsMissing,
      findingsStale,
      degraded: findingsTotal > 0,
      summary: {
        reason: 'phase-foundation-scan',
      },
    });

    return NextResponse.json({ run: completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('integrity audit already running')) {
      return NextResponse.json(
        {
          error: 'Integrity audit already running',
          reasonCode: 'marketplace-cache-audit-conflict',
        },
        { status: 409 }
      );
    }

    console.error('Failed to start marketplace audit run:', error);
    return NextResponse.json(
      {
        error: 'Failed to start marketplace audit run',
        reasonCode: 'marketplace-cache-audit-start-failed',
      },
      { status: 500 }
    );
  }
}
