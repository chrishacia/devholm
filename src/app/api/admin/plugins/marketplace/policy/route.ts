import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import {
  getMarketplaceCachePolicy,
  setMarketplaceCachePolicy,
  DEFAULT_MARKETPLACE_CACHE_POLICY,
} from '@/db/marketplace-cache-admin';

const policySchema = z.object({
  version: z.number().int().positive(),
  maxCacheBytes: z.number().int().positive(),
  maxArtifactAgeMs: z.number().int().positive(),
  warnUsageRatio: z.number().gt(0).lte(1),
  evictionBatchSize: z.number().int().positive(),
});

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const policy = await getMarketplaceCachePolicy();
    return NextResponse.json({ policy, defaults: DEFAULT_MARKETPLACE_CACHE_POLICY });
  } catch (error) {
    console.error('Failed to read marketplace cache policy:', error);
    return NextResponse.json(
      {
        error: 'Failed to read marketplace cache policy',
        reasonCode: 'marketplace-cache-policy-read-failed',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = policySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid policy payload',
          reasonCode: 'marketplace-cache-policy-invalid',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const createdBy =
      (typeof token.email === 'string' && token.email) ||
      (typeof token.sub === 'string' && token.sub) ||
      (typeof token.name === 'string' && token.name) ||
      undefined;

    const policy = await setMarketplaceCachePolicy(parsed.data, createdBy);
    return NextResponse.json({ policy });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('unsupported policy version')) {
      return NextResponse.json(
        {
          error: message,
          reasonCode: 'marketplace-cache-policy-version-unsupported',
        },
        { status: 409 }
      );
    }

    console.error('Failed to update marketplace cache policy:', error);
    return NextResponse.json(
      {
        error: 'Failed to update marketplace cache policy',
        reasonCode: 'marketplace-cache-policy-update-failed',
      },
      { status: 500 }
    );
  }
}
