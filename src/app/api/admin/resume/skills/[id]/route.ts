import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/admin/resume/skills/[id] - Update a skill
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, category, sort_order } = body;

    const skill = await resumeDb.updateSkill(id, { name, category, sort_order });

    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    return NextResponse.json({ skill });
  } catch (error) {
    console.error('Error updating skill:', error);
    return NextResponse.json({ error: 'Failed to update skill' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/resume/skills/[id] - Delete a skill
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await resumeDb.deleteSkill(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting skill:', error);
    return NextResponse.json({ error: 'Failed to delete skill' }, { status: 500 });
  }
}
