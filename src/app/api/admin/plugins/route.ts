import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { listPluginStates } from '@/db/plugins';
import { orchestratePluginLifecycleMutation } from '@core/lib/plugin-lifecycle-orchestrator.server';

const updateSchema = z.object({
  pluginId: z.string().min(1).max(120),
  isEnabled: z.boolean(),
});

function mapLifecycleError(error: unknown): { status: number; body: { error: string } } {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('Unknown plugin')) {
    return { status: 404, body: { error: message } };
  }

  if (
    message.includes('not installed') ||
    message.includes('requires it') ||
    message.includes('must be enabled')
  ) {
    return { status: 409, body: { error: message } };
  }

  return { status: 500, body: { error: 'Failed to update plugin state' } };
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

    await orchestratePluginLifecycleMutation({
      action: parsed.data.isEnabled ? 'enable' : 'disable',
      pluginId: parsed.data.pluginId,
      initiatedBy,
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

    await orchestratePluginLifecycleMutation({
      action: 'install',
      pluginId: parsed.data.pluginId,
      initiatedBy,
    });

    const plugins = await listPluginStates();
    return NextResponse.json({ plugins });
  } catch (error) {
    console.error('Failed to install plugin:', error);
    const mapped = mapLifecycleError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
