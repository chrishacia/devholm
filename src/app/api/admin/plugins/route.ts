import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { listPluginStates, updatePluginEnabledState } from '@/db/plugins';

const updateSchema = z.object({
  pluginId: z.string().min(1).max(120),
  isEnabled: z.boolean(),
});

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

    const updated = await updatePluginEnabledState(parsed.data.pluginId, parsed.data.isEnabled);

    if (!updated) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }

    const plugins = await listPluginStates();
    return NextResponse.json({ plugins });
  } catch (error) {
    console.error('Failed to update plugin state:', error);
    return NextResponse.json({ error: 'Failed to update plugin state' }, { status: 500 });
  }
}
