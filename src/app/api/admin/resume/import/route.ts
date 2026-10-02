import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import {
  getResumeImportPreview,
  replaceResumeFromImport,
  restoreResumeFromBackup,
  validateResumeImportInput,
} from '@/db/resume-import';
import { ZodError } from 'zod';

type ImportAction = 'preview' | 'apply' | 'restore';

/**
 * POST /api/admin/resume/import
 *
 * Preview payload:
 *   { action: "preview", data: <resume import json> }
 *
 * Apply payload:
 *   { action: "apply", data: <resume import json> }
 *
 * Restore payload:
 *   { action: "restore", backup: <backup object from apply response> }
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = (body?.action as ImportAction | undefined) ?? 'preview';

    if (action === 'restore') {
      if (!body?.backup) {
        return NextResponse.json({ error: 'backup is required for restore' }, { status: 400 });
      }

      const result = await restoreResumeFromBackup(body.backup);
      return NextResponse.json({
        ok: true,
        action,
        preview: result.preview,
      });
    }

    if (!body?.data) {
      return NextResponse.json({ error: 'data is required for preview/apply' }, { status: 400 });
    }

    const input = validateResumeImportInput(body.data);

    if (action === 'preview') {
      const preview = await getResumeImportPreview(input);
      return NextResponse.json({
        ok: true,
        action,
        preview,
      });
    }

    if (action === 'apply') {
      const result = await replaceResumeFromImport(input);
      return NextResponse.json({
        ok: true,
        action,
        preview: result.preview,
        backup: result.backup,
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('Error importing resume:', error);

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid resume import payload',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to import resume';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
