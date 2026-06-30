import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

/**
 * GET /api/admin/resume/education - Get all education entries
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const education = await resumeDb.getAllEducation();
    return NextResponse.json({ education });
  } catch (error) {
    console.error('Error fetching education:', error);
    return NextResponse.json({ error: 'Failed to fetch education' }, { status: 500 });
  }
}

/**
 * POST /api/admin/resume/education - Create a new education entry
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
      sort_order = 0,
    } = body;

    if (!degree || !school) {
      return NextResponse.json({ error: 'Degree and school are required' }, { status: 400 });
    }

    const education = await resumeDb.createEducation({
      degree,
      field_of_study,
      school,
      location,
      start_date: start_date ? new Date(start_date) : null,
      end_date: end_date ? new Date(end_date) : null,
      description,
      sort_order,
    });

    return NextResponse.json({ education }, { status: 201 });
  } catch (error) {
    console.error('Error creating education:', error);
    return NextResponse.json({ error: 'Failed to create education' }, { status: 500 });
  }
}
