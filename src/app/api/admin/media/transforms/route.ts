import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listMediaTransformsByContext, upsertMediaTransform } from '@/db/media-transforms';
import { verifyAdmin } from '@/lib/auth-helpers';

const upsertSchema = z.object({
  mediaAssetId: z.string().uuid(),
  contextType: z.string().min(1).max(80),
  contextId: z.string().min(1).max(120),
  name: z.string().min(1).max(120).optional(),
  cropX: z.coerce.number().int().min(0),
  cropY: z.coerce.number().int().min(0),
  cropWidth: z.coerce.number().int().min(0),
  cropHeight: z.coerce.number().int().min(0),
  focusX: z.coerce.number().int().min(0).max(100).optional(),
  focusY: z.coerce.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

const listSchema = z.object({
  contextType: z.string().min(1).max(80),
  contextId: z.string().min(1).max(120),
});

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = listSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );

  if (!query.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: query.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const transforms = await listMediaTransformsByContext(
      query.data.contextType,
      query.data.contextId
    );

    return NextResponse.json({ transforms });
  } catch (error) {
    console.error('Failed to list media transforms:', error);
    return NextResponse.json({ error: 'Failed to fetch media transforms' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = upsertSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const transform = await upsertMediaTransform(parsed.data);
    return NextResponse.json(transform, { status: 201 });
  } catch (error) {
    console.error('Failed to save media transform:', error);
    return NextResponse.json({ error: 'Failed to save media transform' }, { status: 500 });
  }
}
