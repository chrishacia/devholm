import { NextResponse } from 'next/server';
import * as usesDb from '@/db/uses';

/**
 * GET /api/uses - Get all uses categories with items (public)
 */
export async function GET() {
  try {
    const categories = await usesDb.getAllCategoriesWithItems();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error fetching uses data:', error);
    return NextResponse.json({ error: 'Failed to fetch uses data' }, { status: 500 });
  }
}
