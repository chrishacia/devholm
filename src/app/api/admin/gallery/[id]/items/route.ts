import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createGalleryItem, listGalleryItems, reorderGalleryItems } from '@/db/gallery';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const createSchema = z.object({
  kind: z.enum(['media', 'external']),
  sortOrder: z.coerce.number().int().min(0).default(0),
  mediaAssetId: z.string().uuid().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  externalProvider: z.string().max(80).nullable().optional(),
  title: z.string().max(220).nullable().optional(),
  caption: z.string().max(2000).nullable().optional(),
  isEnabled: z.boolean().default(true),
});

const reorderSchema = z.object({
  order: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.coerce.number().int().min(0),
    })
  ),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const items = await listGalleryItems(id, false);
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Failed to list gallery items:', error);
    return NextResponse.json({ error: 'Failed to fetch gallery items' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();

    if (body.order) {
      const reorder = reorderSchema.safeParse(body);
      if (!reorder.success) {
        return NextResponse.json(
          { error: 'Invalid reorder payload', details: reorder.error.flatten() },
          { status: 400 }
        );
      }

      await reorderGalleryItems(id, reorder.data.order);
      const items = await listGalleryItems(id, false);
      return NextResponse.json({ items });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = await createGalleryItem({
      ...parsed.data,
      galleryId: id,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create gallery item:', error);
    return NextResponse.json({ error: 'Failed to create gallery item' }, { status: 500 });
  }
}
