import * as path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import {
  cancelMarketplaceInstallOperation,
  ensureMarketplaceInstallStartupReconciliation,
  readMarketplaceInstallOperationState,
} from '@core/lib/plugin-marketplace-install-operation.server';

const DEFAULT_FIRST_PARTY_INSTALL_ROOT = path.resolve(
  process.cwd(),
  'generated/plugins/marketplace-first-party'
);

const cancellationSchema = z.object({
  pluginId: z.string().min(1),
  action: z.literal('cancel'),
});

function isMarketplaceExecutionEnabled(): boolean {
  return process.env.DEVHOLM_MARKETPLACE_FIRST_PARTY_INSTALL_ENABLED === 'true';
}

function toPublicOperation(
  operation: NonNullable<Awaited<ReturnType<typeof readMarketplaceInstallOperationState>>>
) {
  return {
    operationId: operation.operationId,
    pluginId: operation.pluginId,
    targetVersion: operation.targetVersion,
    targetSha256: operation.targetSha256,
    status: operation.status,
    stage: operation.stage,
    startedAt: operation.startedAt,
    updatedAt: operation.updatedAt,
    finishedAt: operation.finishedAt,
    initiatedBy: operation.initiatedBy,
    acquisitionMode: operation.acquisitionMode,
    offlineOnly: operation.offlineOnly,
    cancellation: operation.cancellation,
    notes: operation.notes,
    error: operation.error,
    trust: operation.trust
      ? {
          keyId: operation.trust.keyId,
          algorithm: operation.trust.algorithm,
          signedPayloadVersion: operation.trust.signedPayloadVersion,
          signedPayloadSha256: operation.trust.signedPayloadSha256,
          verificationTimestamp: operation.trust.verificationTimestamp,
          trustDecision: operation.trust.trustDecision,
          verificationStatus: operation.trust.verificationStatus,
          publisherId: operation.trust.publisherId,
          revocationState: operation.trust.revocationState,
          notes: operation.trust.notes,
        }
      : undefined,
  };
}

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isMarketplaceExecutionEnabled()) {
    return NextResponse.json(
      { error: 'Marketplace first-party runtime install execution is disabled' },
      { status: 403 }
    );
  }

  const pluginId = request.nextUrl.searchParams.get('pluginId')?.trim();
  if (!pluginId) {
    return NextResponse.json({ error: 'pluginId query parameter is required' }, { status: 400 });
  }

  let operation = null;
  try {
    await ensureMarketplaceInstallStartupReconciliation(DEFAULT_FIRST_PARTY_INSTALL_ROOT);
    operation = await readMarketplaceInstallOperationState(
      DEFAULT_FIRST_PARTY_INSTALL_ROOT,
      pluginId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('corrupted')) {
      return NextResponse.json(
        { error: 'Operation state is corrupted and requires manual recovery' },
        { status: 409 }
      );
    }
    throw error;
  }

  if (!operation) {
    return NextResponse.json({ error: 'No operation state found for plugin' }, { status: 404 });
  }

  return NextResponse.json({
    operation: toPublicOperation(operation),
    cancellationPolicy: 'best-effort cancellation is only honored before active promotion',
  });
}

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isMarketplaceExecutionEnabled()) {
    return NextResponse.json(
      { error: 'Marketplace first-party runtime install execution is disabled' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = cancellationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await ensureMarketplaceInstallStartupReconciliation(DEFAULT_FIRST_PARTY_INSTALL_ROOT);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('corrupted')) {
      return NextResponse.json(
        { error: 'Operation state is corrupted and requires manual recovery' },
        { status: 409 }
      );
    }
    throw error;
  }
  const requestedBy =
    (typeof token.email === 'string' && token.email) ||
    (typeof token.sub === 'string' && token.sub) ||
    undefined;

  const operation = await cancelMarketplaceInstallOperation({
    installRoot: DEFAULT_FIRST_PARTY_INSTALL_ROOT,
    pluginId: parsed.data.pluginId,
    requestedBy,
  });

  if (!operation) {
    return NextResponse.json({ error: 'No operation state found for plugin' }, { status: 404 });
  }

  if (operation.status !== 'in_progress') {
    return NextResponse.json(
      {
        error: 'Install operation is not cancellable in its current state',
        operation: toPublicOperation(operation),
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    operation: toPublicOperation(operation),
    cancellationPolicy: 'best-effort cancellation is only honored before active promotion',
  });
}
