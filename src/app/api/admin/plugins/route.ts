import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { listPluginStates } from '@/db/plugins';
import { orchestratePluginLifecycleMutation } from '@core/lib/plugin-lifecycle-orchestrator.server';
import { PluginLifecycleError, mapUnknownLifecycleError } from '@core/lib/plugin-lifecycle-errors';

const updateSchema = z.object({
  pluginId: z.string().min(1).max(120),
  isEnabled: z.boolean(),
});

function mapLifecycleError(error: unknown): { status: number; body: { error: string } } {
  const lifecycleError =
    error instanceof PluginLifecycleError ? error : mapUnknownLifecycleError(error);
  return {
    status: lifecycleError.httpStatus,
    body: { error: lifecycleError.publicMessage },
  };
}

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const plugins = await listPluginStates();
    return NextResponse.json({ plugins });
  } catch (error) {
    console.error('Failed to fetch plugins:', error);
    return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const initiatedBy =
      (typeof token.email === 'string' && token.email) ||
      (typeof token.sub === 'string' && token.sub) ||
      (typeof token.name === 'string' && token.name) ||
      undefined;
    const idempotencyKey = request.headers.get('x-idempotency-key')?.trim() || undefined;
    const correlationId = request.headers.get('x-correlation-id')?.trim() || undefined;

    await orchestratePluginLifecycleMutation({
      action: parsed.data.isEnabled ? 'enable' : 'disable',
      pluginId: parsed.data.pluginId,
      initiatedBy,
      idempotencyKey,
      correlationId,
      expectedLifecycleState: parsed.data.isEnabled ? 'disabled' : 'installed',
      authorizationContext: {
        isAdmin: true,
        principal: initiatedBy,
        roles: ['admin'],
      },
    });

    const plugins = await listPluginStates();
    return NextResponse.json({ plugins });
  } catch (error) {
    console.error('Failed to update plugin state:', error);
    const mapped = mapLifecycleError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

const installSchema = z.object({
  pluginId: z.string().min(1).max(120),
});

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = installSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const initiatedBy =
      (typeof token.email === 'string' && token.email) ||
      (typeof token.sub === 'string' && token.sub) ||
      (typeof token.name === 'string' && token.name) ||
      undefined;
    const idempotencyKey = request.headers.get('x-idempotency-key')?.trim() || undefined;
    const correlationId = request.headers.get('x-correlation-id')?.trim() || undefined;

    await orchestratePluginLifecycleMutation({
      action: 'install',
      pluginId: parsed.data.pluginId,
      initiatedBy,
      idempotencyKey,
      correlationId,
      authorizationContext: {
        isAdmin: true,
        principal: initiatedBy,
        roles: ['admin'],
      },
    });

    const plugins = await listPluginStates();
    return NextResponse.json({ plugins });
  } catch (error) {
    console.error('Failed to install plugin:', error);
    const mapped = mapLifecycleError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
