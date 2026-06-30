import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { deleteCmsPage, getAdminCmsPageById, updateCmsPage } from '@/db/pages';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updatePageSchema = z.object({
  title: z.string().min(3).max(300),
  slug: z.string().min(1).max(300).optional(),
  excerpt: z.string().max(500).nullable().optional(),
  content: z.string().min(1).max(200000),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  isEnabled: z.boolean().default(true),
  navLabel: z.string().max(120).nullable().optional(),
  showInMainNav: z.boolean().default(false),
  showInFooterMain: z.boolean().default(false),
  showInFooterResources: z.boolean().default(false),
  includeInSitemap: z.boolean().default(true),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const page = await getAdminCmsPageById(id);
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }
    return NextResponse.json(page);
  } catch (error) {
    console.error('Failed to fetch page:', error);
    return NextResponse.json({ error: 'Failed to fetch page' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = updatePageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateCmsPage(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update page:', error);
    const message = error instanceof Error ? error.message : 'Failed to update page';
    const status = message.includes('already exists') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const deleted = await deleteCmsPage(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete page:', error);
    return NextResponse.json({ error: 'Failed to delete page' }, { status: 500 });
  }
}
