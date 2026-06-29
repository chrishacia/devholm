import { NextRequest, NextResponse } from 'next/server';
import { getGalleryCollectionBySlug, listGalleryItems } from '@/db/gallery';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  try {
    const gallery = await getGalleryCollectionBySlug(slug, false);
    if (!gallery) {
      return NextResponse.json({ error: 'Gallery not found' }, { status: 404 });
    }

    const items = await listGalleryItems(gallery.id, true);
    return NextResponse.json({ gallery, items });
  } catch (error) {
    console.error('Failed to fetch public gallery:', error);
    return NextResponse.json({ error: 'Failed to fetch gallery' }, { status: 500 });
  }
}
