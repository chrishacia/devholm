import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

/**
 * GET /api/admin/resume - Get full resume data for admin management
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section');

  try {
    if (section === 'skills') {
      const skills = await resumeDb.getAllSkills();
      return NextResponse.json({ skills });
    }

    if (section === 'experiences') {
      const experiences = await resumeDb.getAllExperiences();
      return NextResponse.json({ experiences });
    }

    if (section === 'education') {
      const education = await resumeDb.getAllEducation();
      return NextResponse.json({ education });
    }

    if (section === 'certifications') {
      const certifications = await resumeDb.getAllCertifications();
      return NextResponse.json({ certifications });
    }

    // Return all sections
    const fullResume = await resumeDb.getFullResume();
    return NextResponse.json(fullResume);
  } catch (error) {
    console.error('Error fetching resume data:', error);
    return NextResponse.json({ error: 'Failed to fetch resume data' }, { status: 500 });
  }
}
