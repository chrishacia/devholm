import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

/**
 * GET /api/admin/resume/experiences - Get all experiences
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const experiences = await resumeDb.getAllExperiences();
    return NextResponse.json({ experiences });
  } catch (error) {
    console.error('Error fetching experiences:', error);
    return NextResponse.json({ error: 'Failed to fetch experiences' }, { status: 500 });
  }
}

/**
 * POST /api/admin/resume/experiences - Create a new experience
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      title,
      company,
      location,
      employment_type = 'full-time',
      start_date,
      end_date,
      is_current = false,
      description,
      sort_order = 0,
      highlights = [],
      technologies = [],
    } = body;

    if (!title || !company || !start_date) {
      return NextResponse.json(
        { error: 'Title, company, and start date are required' },
        { status: 400 }
      );
    }

    const experience = await resumeDb.createExperience(
      {
        title,
        company,
        location,
        employment_type,
        start_date: new Date(start_date),
        end_date: end_date ? new Date(end_date) : null,
        is_current,
        description,
        sort_order,
      },
      highlights,
      technologies
    );

    return NextResponse.json({ experience }, { status: 201 });
  } catch (error) {
    console.error('Error creating experience:', error);
    return NextResponse.json({ error: 'Failed to create experience' }, { status: 500 });
  }
}
