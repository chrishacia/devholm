import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createGalleryCollection,
  createGalleryItem,
  deleteGalleryCollection,
  deleteGalleryItem,
  getGalleryCollectionById,
  getGalleryCollectionBySlug,
  listGalleryCollections,
  listGalleryItems,
  reorderGalleryItems,
  updateGalleryCollection,
  updateGalleryItem,
} from '@/db/gallery';
import { verifyAdmin } from '@/lib/auth-helpers';

type VerifyAdminFn = typeof verifyAdmin;

interface GalleryAdminApiHandlerDeps {
  verifyAdmin: VerifyAdminFn;
}

const defaultDeps: GalleryAdminApiHandlerDeps = {
  verifyAdmin,
};

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

const createItemSchema = z.object({
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

async function requireAdmin(
  request: NextRequest,
  deps: GalleryAdminApiHandlerDeps
): Promise<Response | null> {
  const token = await deps.verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export async function handleGalleryPublicApi(
  method: 'GET',
  _request: NextRequest,
  segments: string[]
): Promise<Response> {
  const [slug] = segments;

  if (method !== 'GET' || !slug || segments.length !== 1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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

export async function handleGalleryAdminCollectionRoot(
  method: 'GET' | 'POST',
  request: NextRequest,
  deps: GalleryAdminApiHandlerDeps = defaultDeps
) {
  const unauthorized = await requireAdmin(request, deps);
  if (unauthorized) {
    return unauthorized;
  }

  if (method === 'GET') {
    try {
      const galleries = await listGalleryCollections();
      return NextResponse.json({ galleries });
    } catch (error) {
      console.error('Failed to list galleries:', error);
      return NextResponse.json({ error: 'Failed to fetch galleries' }, { status: 500 });
    }
  }

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

export async function handleGalleryAdminCollectionById(
  method: 'GET' | 'PUT' | 'DELETE',
  request: NextRequest,
  id: string,
  deps: GalleryAdminApiHandlerDeps = defaultDeps
) {
  const unauthorized = await requireAdmin(request, deps);
  if (unauthorized) {
    return unauthorized;
  }

  if (method === 'GET') {
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

  if (method === 'PUT') {
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

export async function handleGalleryAdminCollectionItems(
  method: 'GET' | 'POST',
  request: NextRequest,
  id: string,
  deps: GalleryAdminApiHandlerDeps = defaultDeps
) {
  const unauthorized = await requireAdmin(request, deps);
  if (unauthorized) {
    return unauthorized;
  }

  if (method === 'GET') {
    try {
      const items = await listGalleryItems(id, false);
      return NextResponse.json({ items });
    } catch (error) {
      console.error('Failed to list gallery items:', error);
      return NextResponse.json({ error: 'Failed to fetch gallery items' }, { status: 500 });
    }
  }

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

    const parsed = createItemSchema.safeParse(body);
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

export async function handleGalleryAdminItemById(
  method: 'PUT' | 'DELETE',
  request: NextRequest,
  itemId: string,
  deps: GalleryAdminApiHandlerDeps = defaultDeps
) {
  const unauthorized = await requireAdmin(request, deps);
  if (unauthorized) {
    return unauthorized;
  }

  if (method === 'PUT') {
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
