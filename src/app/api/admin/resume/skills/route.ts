import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

/**
 * GET /api/admin/resume/skills - Get all skills
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const skills = await resumeDb.getAllSkills();
    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Error fetching skills:', error);
    return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 });
  }
}

/**
 * POST /api/admin/resume/skills - Create a new skill
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, category, sort_order = 0 } = body;

    if (!name || !category) {
      return NextResponse.json({ error: 'Name and category are required' }, { status: 400 });
    }

    const skill = await resumeDb.createSkill({ name, category, sort_order });
    return NextResponse.json({ skill }, { status: 201 });
  } catch (error) {
    console.error('Error creating skill:', error);
    return NextResponse.json({ error: 'Failed to create skill' }, { status: 500 });
  }
}
