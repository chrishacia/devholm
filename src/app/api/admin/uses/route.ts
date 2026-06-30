import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as usesDb from '@/db/uses';

/**
 * GET /api/admin/uses - Get all categories with items for admin
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const categories = await usesDb.getAllCategoriesWithItems();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error fetching uses data:', error);
    return NextResponse.json({ error: 'Failed to fetch uses data' }, { status: 500 });
  }
}

/**
 * POST /api/admin/uses - Create a new category
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, icon = 'Build', sort_order = 0 } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const category = await usesDb.createCategory({
      title,
      icon,
      sort_order,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}
