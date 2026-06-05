import { NextResponse } from 'next/server';
import { getPublicAuthConfiguration } from '@/db/auth';

export async function GET() {
  try {
    const config = await getPublicAuthConfiguration();
    return NextResponse.json({ data: config });
  } catch (error) {
    console.error('Auth config GET error:', error);
    return NextResponse.json({ error: 'Failed to load auth configuration' }, { status: 500 });
  }
}
