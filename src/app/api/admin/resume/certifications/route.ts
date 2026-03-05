import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

/**
 * GET /api/admin/resume/certifications - Get all certifications
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const certifications = await resumeDb.getAllCertifications();
    return NextResponse.json({ certifications });
  } catch (error) {
    console.error('Error fetching certifications:', error);
    return NextResponse.json({ error: 'Failed to fetch certifications' }, { status: 500 });
  }
}

/**
 * POST /api/admin/resume/certifications - Create a new certification
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      name,
      issuer,
      issue_date,
      expiry_date,
      credential_id,
      credential_url,
      sort_order = 0,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Certification name is required' }, { status: 400 });
    }

    const certification = await resumeDb.createCertification({
      name,
      issuer,
      issue_date: issue_date ? new Date(issue_date) : null,
      expiry_date: expiry_date ? new Date(expiry_date) : null,
      credential_id,
      credential_url,
      sort_order,
    });

    return NextResponse.json({ certification }, { status: 201 });
  } catch (error) {
    console.error('Error creating certification:', error);
    return NextResponse.json({ error: 'Failed to create certification' }, { status: 500 });
  }
}
