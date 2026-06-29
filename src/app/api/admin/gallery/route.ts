import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { createGalleryCollection, listGalleryCollections } from '@/db/gallery';

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

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const galleries = await listGalleryCollections();
    return NextResponse.json({ galleries });
  } catch (error) {
    console.error('Failed to list galleries:', error);
    return NextResponse.json({ error: 'Failed to fetch galleries' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = gallerySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = await createGalleryCollection(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create gallery:', error);
    const message = error instanceof Error ? error.message : 'Failed to create gallery';
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') ? 400 : 500 }
    );
  }
}
