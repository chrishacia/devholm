import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { executeFirstPartyMarketplaceInstall } from '@core/lib/plugin-marketplace-install-execution.server';
import { parseMarketplaceInstallSourceDescriptor } from '@core/lib/plugin-install-source-descriptor.server';
import type {
  MarketplaceCatalogEntry,
  MarketplaceInstallSourceDescriptorInput,
} from '@core/types/plugin-marketplace-contract';

function isMarketplaceExecutionEnabled(): boolean {
  return process.env.DEVHOLM_MARKETPLACE_FIRST_PARTY_INSTALL_ENABLED === 'true';
}

const requestSchema = z.object({
  descriptor: z.record(z.any()),
  catalogEntry: z.record(z.any()),
  artifactPath: z.string().min(1).optional(),
  acquisitionMode: z.enum(['local-path', 'remote-first-party']).optional(),
  offlineOnly: z.boolean().optional(),
  explicitAdminApproval: z.literal(true),
});

function mapInstallExecutionError(error: unknown): { status: number; body: { error: string } } {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('runtime install execution is disabled')) {
    return { status: 403, body: { error: message } };
  }

  if (
    message.includes('planner blocked') ||
    message.includes('mismatch') ||
    message.includes('must be') ||
    message.includes('already installed') ||
    message.includes('explicit admin approval') ||
    message.includes('cancelled') ||
    message.includes('in progress') ||
    message.includes('corrupted')
  ) {
    return { status: 409, body: { error: message } };
  }

  return { status: 500, body: { error: 'Failed to execute marketplace install' } };
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

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const descriptorParse = parseMarketplaceInstallSourceDescriptor(
      parsed.data.descriptor as MarketplaceInstallSourceDescriptorInput
    );

    if (!descriptorParse.descriptor) {
      return NextResponse.json(
        {
          error: 'Invalid install descriptor',
          details: descriptorParse.errors,
        },
        { status: 400 }
      );
    }

    const initiatedBy =
      (typeof token.email === 'string' && token.email) ||
      (typeof token.sub === 'string' && token.sub) ||
      (typeof token.name === 'string' && token.name) ||
      undefined;

    const result = await executeFirstPartyMarketplaceInstall({
      descriptor: descriptorParse.descriptor,
      catalogEntry: parsed.data.catalogEntry as MarketplaceCatalogEntry,
      artifactPath: parsed.data.artifactPath,
      acquisitionMode: parsed.data.acquisitionMode,
      offlineOnly: parsed.data.offlineOnly,
      explicitAdminApproval: parsed.data.explicitAdminApproval,
      initiatedBy,
    });

    return NextResponse.json({
      result: {
        pluginId: result.pluginId,
        version: result.version,
        sha256: result.sha256,
        plannerSummary: result.plannerSummary,
        previousVersion: result.previousVersion,
        lifecycleExecution: result.lifecycleExecution,
        migrationExecution: result.migrationExecution,
        installedAt: result.installedAt,
        capabilityContract: {
          hasEscalation: result.capabilityContract.hasEscalation,
          approvals: result.capabilityContract.approvals,
          blockers: result.capabilityContract.blockers,
          summary: result.capabilityContract.summary,
        },
        acquisition: result.acquisition
          ? {
              source: result.acquisition.source,
              cacheKey: result.acquisition.cacheKey,
              downloadedBytes: result.acquisition.downloadedBytes,
              approvedHost: result.acquisition.approvedHost,
              redirectChainHosts: result.acquisition.redirectChain
                .map((url) => {
                  try {
                    return new URL(url).hostname.toLowerCase();
                  } catch {
                    return null;
                  }
                })
                .filter((hostname): hostname is string => hostname !== null),
              durationMs: result.acquisition.durationMs,
              warnings: result.acquisition.warnings,
              blockers: result.acquisition.blockers,
              readyForStaging: result.acquisition.readyForStaging,
            }
          : undefined,
        operation: {
          operationId: result.operation.operationId,
          status: result.operation.status,
          stage: result.operation.stage,
          startedAt: result.operation.startedAt,
          updatedAt: result.operation.updatedAt,
          finishedAt: result.operation.finishedAt,
          cancellation: result.operation.cancellation,
          notes: result.operation.notes,
          error: result.operation.error,
        },
      },
      notes: [
        'lifecycle hooks were not executed in this phase',
        'migrations were not executed in this phase',
      ],
    });
  } catch (error) {
    console.error('Failed to execute marketplace install:', error);
    const mapped = mapInstallExecutionError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
