import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import { writeFile, mkdir, unlink, readdir } from 'fs/promises';
import path from 'path';

const RESUME_DIR = path.join(process.cwd(), 'public', 'uploads', 'resume');
const RESUME_FILENAME = 'resume.pdf';
const RESUME_PATH = path.join(RESUME_DIR, RESUME_FILENAME);
const PUBLIC_URL = '/uploads/resume/resume.pdf';

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types for resume
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * GET /api/admin/resume/upload - Get current resume info
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if resume exists
    const files: string[] = await readdir(RESUME_DIR).catch(() => [] as string[]);
    const resumeExists = files.includes(RESUME_FILENAME);

    if (resumeExists) {
      const { stat } = await import('fs/promises');
      const stats = await stat(RESUME_PATH);
      return NextResponse.json({
        exists: true,
        url: PUBLIC_URL,
        filename: RESUME_FILENAME,
        size: stats.size,
        uploadedAt: stats.mtime,
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    console.error('Error checking resume:', error);
    return NextResponse.json({ error: 'Failed to check resume status' }, { status: 500 });
  }
}

/**
 * POST /api/admin/resume/upload - Upload a new resume (replaces existing)
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a PDF or Word document' },
        { status: 400 }
      );
    }

    // Ensure directory exists
    await mkdir(RESUME_DIR, { recursive: true });

    // Delete existing resume if it exists
    try {
      await unlink(RESUME_PATH);
    } catch {
      // File doesn't exist, ignore
    }

    // Get file extension from original filename or MIME type
    let ext = '.pdf';
    if (file.type === 'application/msword') {
      ext = '.doc';
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      ext = '.docx';
    }

    // Use consistent filename with proper extension
    const finalFilename = `resume${ext}`;
    const finalPath = path.join(RESUME_DIR, finalFilename);
    const finalUrl = `/uploads/resume/${finalFilename}`;

    // Write new file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(finalPath, buffer);

    return NextResponse.json({
      success: true,
      url: finalUrl,
      filename: finalFilename,
      originalFilename: file.name,
      size: file.size,
    });
  } catch (error) {
    console.error('Error uploading resume:', error);
    return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/resume/upload - Delete the current resume
 */
export async function DELETE(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Try to delete any resume file in the directory
    const files: string[] = await readdir(RESUME_DIR).catch(() => [] as string[]);

    for (const file of files) {
      if (file.startsWith('resume.')) {
        await unlink(path.join(RESUME_DIR, file));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting resume:', error);
    return NextResponse.json({ error: 'Failed to delete resume' }, { status: 500 });
  }
}
