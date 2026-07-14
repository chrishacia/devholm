import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import {
  listMarketplaceEligibleEvictionCandidates,
  startMarketplaceCleanupRun,
  completeMarketplaceCleanupRun,
  executeMarketplaceCleanupPlan,
} from '@/db/marketplace-cache-admin';

const cleanupSchema = z.object({
  mode: z.enum(['dry-run', 'execute']).default('dry-run'),
  limit: z.number().int().positive().max(1000).optional(),
  confirmation: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = cleanupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid cleanup payload',
          reasonCode: 'marketplace-cache-cleanup-invalid',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const initiatedBy =
      (typeof token.email === 'string' && token.email) ||
      (typeof token.sub === 'string' && token.sub) ||
      (typeof token.name === 'string' && token.name) ||
      undefined;

    if (parsed.data.mode === 'execute') {
      if (parsed.data.confirmation !== 'execute-cleanup') {
        return NextResponse.json(
          {
            error: 'Cleanup execution requires explicit confirmation',
            reasonCode: 'marketplace-cache-cleanup-confirmation-required',
          },
          { status: 400 }
        );
      }

      const executed = await executeMarketplaceCleanupPlan({
        initiatedBy,
        limit: parsed.data.limit,
      });
      return NextResponse.json({
        mode: 'execute',
        run: executed.run,
        plan: executed.plan,
      });
    }

    const plan = await listMarketplaceEligibleEvictionCandidates(parsed.data.limit);
    const run = await startMarketplaceCleanupRun({
      mode: 'dry-run',
      triggeredBy: initiatedBy,
      policyVersion: plan.policy.version,
      plan,
    });
    const completed = await completeMarketplaceCleanupRun({
      runId: run.runId,
      status: 'succeeded',
      evictedEntries: 0,
      evictedBytes: 0,
    });

    return NextResponse.json({
      mode: 'dry-run',
      run: completed,
      plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('cleanup already running')) {
      return NextResponse.json(
        {
          error: 'Cleanup run already in progress',
          reasonCode: 'marketplace-cache-cleanup-conflict',
        },
        { status: 409 }
      );
    }

    console.error('Failed to create cleanup plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to create cleanup plan',
        reasonCode: 'marketplace-cache-cleanup-failed',
      },
      { status: 500 }
    );
  }
}
