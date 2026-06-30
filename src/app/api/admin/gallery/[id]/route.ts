import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteGalleryCollection,
  getGalleryCollectionById,
  updateGalleryCollection,
} from '@/db/gallery';
import { verifyAdmin } from '@/lib/auth-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const gallerySchema = z.object({
  name: z.string().min(2).max(180),
  slug: z.string().min(1).max(220).optional(),
  description: z.string().max(2000).nullable().optional(),
  layout: z.string().min(2).max(80).default('masonry'),
  isPrivate: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  showInMainNav: z.boolean().default(false),
  showInFooterMain: z.boolean().default(false),
  showInFooterResources: z.boolean().default(false),
  includeInSitemap: z.boolean().default(false),
  coverMediaId: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const gallery = await getGalleryCollectionById(id);
    if (!gallery) {
      return NextResponse.json({ error: 'Gallery not found' }, { status: 404 });
    }

    return NextResponse.json(gallery);
  } catch (error) {
    console.error('Failed to fetch gallery:', error);
    return NextResponse.json({ error: 'Failed to fetch gallery' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = gallerySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateGalleryCollection(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Gallery not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update gallery:', error);
    const message = error instanceof Error ? error.message : 'Failed to update gallery';
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') ? 400 : 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const deleted = await deleteGalleryCollection(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Gallery not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete gallery:', error);
    return NextResponse.json({ error: 'Failed to delete gallery' }, { status: 500 });
  }
}
