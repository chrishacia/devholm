import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/resume/experiences/[id] - Get a single experience
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const experience = await resumeDb.getExperienceById(id);

    if (!experience) {
      return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    return NextResponse.json({ experience });
  } catch (error) {
    console.error('Error fetching experience:', error);
    return NextResponse.json({ error: 'Failed to fetch experience' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/resume/experiences/[id] - Update an experience
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
      title,
      company,
      location,
      employment_type,
      start_date,
      end_date,
      is_current,
      description,
      sort_order,
      highlights,
      technologies,
    } = body;

    const experienceData: Record<string, unknown> = {};
    if (title !== undefined) experienceData.title = title;
    if (company !== undefined) experienceData.company = company;
    if (location !== undefined) experienceData.location = location;
    if (employment_type !== undefined) experienceData.employment_type = employment_type;
    if (start_date !== undefined) experienceData.start_date = new Date(start_date);
    if (end_date !== undefined) experienceData.end_date = end_date ? new Date(end_date) : null;
    if (is_current !== undefined) experienceData.is_current = is_current;
    if (description !== undefined) experienceData.description = description;
    if (sort_order !== undefined) experienceData.sort_order = sort_order;

    const experience = await resumeDb.updateExperience(
      id,
      experienceData,
      highlights,
      technologies
    );

    if (!experience) {
      return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    return NextResponse.json({ experience });
  } catch (error) {
    console.error('Error updating experience:', error);
    return NextResponse.json({ error: 'Failed to update experience' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/resume/experiences/[id] - Delete an experience
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await resumeDb.deleteExperience(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting experience:', error);
    return NextResponse.json({ error: 'Failed to delete experience' }, { status: 500 });
  }
}
