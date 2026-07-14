import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import {
  getMarketplaceMirrorById,
  listMarketplaceMirrors,
  upsertMarketplaceMirror,
} from '@/db/marketplace-cache-admin';

const mirrorSchema = z.object({
  mirrorId: z.string().min(1),
  baseUrl: z.string().url(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  authType: z.string().min(1).optional(),
  authSecretRef: z.string().min(1).nullable().optional(),
  authSecretValue: z.string().min(1).nullable().optional(),
  authHeaders: z.record(z.string(), z.string()).nullable().optional(),
  healthState: z.string().min(1).optional(),
  lastStatusCode: z.number().int().nullable().optional(),
  lastError: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
});

const patchSchema = mirrorSchema.partial().extend({
  mirrorId: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const mirrors = await listMarketplaceMirrors();
    return NextResponse.json({ mirrors });
  } catch (error) {
    console.error('Failed to list marketplace mirrors:', error);
    return NextResponse.json(
      {
        error: 'Failed to list marketplace mirrors',
        reasonCode: 'marketplace-cache-mirrors-read-failed',
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
    const body = await request.json();
    const parsed = mirrorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid mirror payload',
          reasonCode: 'marketplace-cache-mirror-invalid',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const mirror = await upsertMarketplaceMirror(parsed.data);
    return NextResponse.json({ mirror });
  } catch (error) {
    console.error('Failed to persist marketplace mirror:', error);
    return NextResponse.json(
      {
        error: 'Failed to persist marketplace mirror',
        reasonCode: 'marketplace-cache-mirror-write-failed',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid mirror patch payload',
          reasonCode: 'marketplace-cache-mirror-patch-invalid',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const existing = await getMarketplaceMirrorById(parsed.data.mirrorId);
    if (!existing) {
      return NextResponse.json(
        {
          error: 'Mirror not found',
          reasonCode: 'marketplace-cache-mirror-not-found',
        },
        { status: 404 }
      );
    }

    const mirror = await upsertMarketplaceMirror({
      mirrorId: parsed.data.mirrorId,
      baseUrl: parsed.data.baseUrl ?? existing.baseUrl,
      enabled: parsed.data.enabled ?? existing.enabled,
      priority: parsed.data.priority ?? existing.priority,
      authType: parsed.data.authType ?? existing.authType,
      authSecretRef:
        parsed.data.authSecretRef !== undefined
          ? parsed.data.authSecretRef
          : existing.authSecretRef,
      authSecretValue:
        parsed.data.authSecretValue !== undefined
          ? parsed.data.authSecretValue
          : existing.authSecretValue,
      authHeaders:
        parsed.data.authHeaders !== undefined ? parsed.data.authHeaders : existing.authHeaders,
      healthState: parsed.data.healthState ?? existing.healthState,
      lastStatusCode:
        parsed.data.lastStatusCode !== undefined
          ? parsed.data.lastStatusCode
          : existing.lastStatusCode,
      lastError: parsed.data.lastError !== undefined ? parsed.data.lastError : existing.lastError,
      metadata: parsed.data.metadata !== undefined ? parsed.data.metadata : existing.metadata,
    });
    return NextResponse.json({ mirror });
  } catch (error) {
    console.error('Failed to patch marketplace mirror:', error);
    return NextResponse.json(
      {
        error: 'Failed to patch marketplace mirror',
        reasonCode: 'marketplace-cache-mirror-patch-failed',
      },
      { status: 500 }
    );
  }
}
