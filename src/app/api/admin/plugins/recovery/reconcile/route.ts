import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import {
  reconcileSinglePluginLifecycle,
  runPluginLifecycleRecoveryScan,
} from '@core/lib/plugin-lifecycle-recovery-runner.server';

const requestSchema = z.object({
  pluginId: z.string().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.pluginId) {
      const result = await reconcileSinglePluginLifecycle(parsed.data.pluginId);
      return NextResponse.json({
        scannedAt: new Date().toISOString(),
        pluginCount: 1,
        results: [
          {
            pluginId: parsed.data.pluginId,
            ...result,
          },
        ],
      });
    }

    const result = await runPluginLifecycleRecoveryScan({
      limit: parsed.data.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to reconcile plugin lifecycle recovery state:', error);
    return NextResponse.json(
      {
        error: 'Failed to reconcile plugin lifecycle recovery state',
        reasonCode: 'lifecycle-recovery-scan-failed',
      },
      { status: 500 }
    );
  }
}
