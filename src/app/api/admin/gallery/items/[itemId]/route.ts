import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteGalleryItem, updateGalleryItem } from '@/db/gallery';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

const itemSchema = z.object({
  galleryId: z.string().uuid(),
  kind: z.enum(['media', 'external']),
  sortOrder: z.coerce.number().int().min(0),
  mediaAssetId: z.string().uuid().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  externalProvider: z.string().max(80).nullable().optional(),
  title: z.string().max(220).nullable().optional(),
  caption: z.string().max(2000).nullable().optional(),
  isEnabled: z.boolean().default(true),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;

  try {
    const body = await request.json();
    const parsed = itemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateGalleryItem(itemId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Gallery item not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update gallery item:', error);
    return NextResponse.json({ error: 'Failed to update gallery item' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;

  try {
    const deleted = await deleteGalleryItem(itemId);
    if (!deleted) {
      return NextResponse.json({ error: 'Gallery item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete gallery item:', error);
    return NextResponse.json({ error: 'Failed to delete gallery item' }, { status: 500 });
  }
}
