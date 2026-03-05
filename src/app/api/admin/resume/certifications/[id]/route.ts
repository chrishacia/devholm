import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import * as resumeDb from '@/db/resume';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/admin/resume/certifications/[id] - Update a certification
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, issuer, issue_date, expiry_date, credential_id, credential_url, sort_order } =
      body;

    const certificationData: Record<string, unknown> = {};
    if (name !== undefined) certificationData.name = name;
    if (issuer !== undefined) certificationData.issuer = issuer;
    if (issue_date !== undefined)
      certificationData.issue_date = issue_date ? new Date(issue_date) : null;
    if (expiry_date !== undefined)
      certificationData.expiry_date = expiry_date ? new Date(expiry_date) : null;
    if (credential_id !== undefined) certificationData.credential_id = credential_id;
    if (credential_url !== undefined) certificationData.credential_url = credential_url;
    if (sort_order !== undefined) certificationData.sort_order = sort_order;

    const certification = await resumeDb.updateCertification(id, certificationData);

    if (!certification) {
      return NextResponse.json({ error: 'Certification not found' }, { status: 404 });
    }

    return NextResponse.json({ certification });
  } catch (error) {
    console.error('Error updating certification:', error);
    return NextResponse.json({ error: 'Failed to update certification' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/resume/certifications/[id] - Delete a certification
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await resumeDb.deleteCertification(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Certification not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting certification:', error);
    return NextResponse.json({ error: 'Failed to delete certification' }, { status: 500 });
  }
}
