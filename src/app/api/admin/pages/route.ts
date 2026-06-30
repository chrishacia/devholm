import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/auth-helpers';
import { createCmsPage, listAdminCmsPages } from '@/db/pages';

const createPageSchema = z.object({
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

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || undefined;

  try {
    const result = await listAdminCmsPages({ page, limit, status, search });

    return NextResponse.json({
      pages: result.pages,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to list pages:', error);
    return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = createPageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = await createCmsPage({ ...parsed.data, authorId: token.id as string });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create page:', error);
    const message = error instanceof Error ? error.message : 'Failed to create page';
    const status = message.includes('already exists') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
