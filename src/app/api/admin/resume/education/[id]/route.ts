import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/admin/resume/education/[id] - Update an education entry
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const {
      degree,
      field_of_study,
      school,
      location,
      start_date,
      end_date,
      description,
      sort_order,
    } = body;

    const educationData: Record<string, unknown> = {};
    if (degree !== undefined) educationData.degree = degree;
    if (field_of_study !== undefined) educationData.field_of_study = field_of_study;
    if (school !== undefined) educationData.school = school;
    if (location !== undefined) educationData.location = location;
    if (start_date !== undefined)
      educationData.start_date = start_date ? new Date(start_date) : null;
    if (end_date !== undefined) educationData.end_date = end_date ? new Date(end_date) : null;
    if (description !== undefined) educationData.description = description;
    if (sort_order !== undefined) educationData.sort_order = sort_order;

    const education = await resumeDb.updateEducation(id, educationData);

    if (!education) {
      return NextResponse.json({ error: 'Education not found' }, { status: 404 });
    }

    return NextResponse.json({ education });
  } catch (error) {
    console.error('Error updating education:', error);
    return NextResponse.json({ error: 'Failed to update education' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/resume/education/[id] - Delete an education entry
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await resumeDb.deleteEducation(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Education not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting education:', error);
    return NextResponse.json({ error: 'Failed to delete education' }, { status: 500 });
  }
}
