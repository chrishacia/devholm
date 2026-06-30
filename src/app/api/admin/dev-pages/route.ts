import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { listAdminDevPages, updateDevPagesStates } from '@/db/pages';
import { devPageDefinitions } from '@user/extensions/pages';

const updateSchema = z.object({
  updates: z.array(
    z.object({
      pageKey: z.string().min(1).max(120),
      isEnabled: z.boolean(),
      showInMainNav: z.boolean(),
      showInFooterMain: z.boolean(),
      showInFooterResources: z.boolean(),
      includeInSitemap: z.boolean(),
      navLabel: z.string().max(120).nullable(),
    })
  ),
});

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const pages = await listAdminDevPages(devPageDefinitions);
    return NextResponse.json({ pages });
  } catch (error) {
    console.error('Failed to fetch dev pages:', error);
    return NextResponse.json({ error: 'Failed to fetch dev pages' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await updateDevPagesStates(parsed.data.updates);
    const pages = await listAdminDevPages(devPageDefinitions);
    return NextResponse.json({ pages });
  } catch (error) {
    console.error('Failed to update dev pages:', error);
    return NextResponse.json({ error: 'Failed to update dev pages' }, { status: 500 });
  }
}
