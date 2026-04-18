/**
 * Media API Routes
 * ================
 *
 * Secure file upload API with:
 * - JWT authentication & role checking
 * - Rate limiting
 * - File type validation (magic bytes)
 * - Image processing & optimization
 * - Variant generation
 * - Secure filename generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMediaAssets,
  createMediaAsset,
  createMediaVariants,
  deleteMediaAssets,
  getMediaStats,
  getAllStoragePaths,
  generateFileHash,
  findByHash,
  type MediaVariantInsert,
} from '@/db/media';
import { clearAvatarMediaReference } from '@/db/admin-users';
import { handleFileUpload, deleteMediaFiles } from '@/lib/image-processor';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { upload } from '@/config/env';
import { verifyAdmin } from '@/lib/auth-helpers';

// Next.js route segment config – raise the default 1 MB body-parser limit
export const maxDuration = 60; // seconds
export const dynamic = 'force-dynamic';

// =============================================================================
// Configuration
// =============================================================================

// Max file size: 50MB for large phone photos
const MAX_FILE_SIZE = upload.maxSizeBytes || 50 * 1024 * 1024;

// =============================================================================
// Validation Schemas
// =============================================================================

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z
    .enum(['images', 'documents', 'videos', 'audio', 'other'])
    .nullish()
    .transform((val) => val ?? undefined),
  search: z
    .string()
    .max(100)
    .nullish()
    .transform((val) => val ?? undefined),
});

const deleteBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

// =============================================================================
// GET /api/admin/media - List media assets
// =============================================================================

export async function GET(request: NextRequest) {
  // Authenticate
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-media-list',
    identifier: clientIp,
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  // Parse and validate query params
  const { searchParams } = new URL(request.url);
  const queryResult = listQuerySchema.safeParse({
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
    type: searchParams.get('type'),
    search: searchParams.get('search'),
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: queryResult.error.flatten() },
      { status: 400 }
    );
  }

  const { page, limit, type, search } = queryResult.data;

  try {
    const result = await getMediaAssets(page, limit, type, search);
    const stats = await getMediaStats();

    return NextResponse.json({ ...result, stats }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error('Error fetching media:', error);
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 });
  }
}

// =============================================================================
// POST /api/admin/media - Upload a new file
// =============================================================================

export async function POST(request: NextRequest) {
  // Authenticate
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit (stricter for uploads)
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-media-upload',
    identifier: clientIp,
    ...RateLimits.UPLOAD,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Upload rate limit exceeded. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const altText = formData.get('altText') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Security: Check file size before processing
    if (file.size > MAX_FILE_SIZE) {
      const maxMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));
      return NextResponse.json(
        { error: `File too large. Maximum size is ${maxMb}MB` },
        { status: 400 }
      );
    }

    // Convert to buffer for hash check
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Check for duplicate file by hash
    const fileHash = generateFileHash(buffer);
    const existingAsset = await findByHash(fileHash);

    if (existingAsset) {
      // Return existing asset instead of uploading duplicate
      return NextResponse.json(
        {
          ...existingAsset,
          isDuplicate: true,
          message: 'This file has already been uploaded',
        },
        { status: 200, headers: rateLimitHeaders(rateLimit) }
      );
    }

    // Process the upload (validation, optimization, variant generation)
    // Need to recreate the File object since we consumed the arrayBuffer
    const newFile = new File([buffer], file.name, { type: file.type });

    const uploadResult = await handleFileUpload(newFile, {
      maxSizeBytes: MAX_FILE_SIZE,
      generateVariants: true,
    });

    if (!uploadResult.success || !uploadResult.file) {
      return NextResponse.json({ error: uploadResult.error || 'Upload failed' }, { status: 400 });
    }

    // Save to database
    const asset = await createMediaAsset({
      filename: uploadResult.file.filename,
      original_filename: file.name,
      mime_type: uploadResult.file.mimeType,
      file_size: uploadResult.file.fileSize,
      storage_path: uploadResult.file.storagePath,
      public_url: uploadResult.file.publicUrl,
      alt_text: altText?.substring(0, 300) || null,
      width: uploadResult.file.width,
      height: uploadResult.file.height,
      uploaded_by: token.id as string,
      file_hash: fileHash,
      is_processed: true,
      upload_ip: clientIp,
    });

    // Save variants to database
    if (uploadResult.variants && uploadResult.variants.length > 0) {
      const variantInserts: MediaVariantInsert[] = uploadResult.variants.map((v) => ({
        media_asset_id: asset.id,
        variant_name: v.variantName || 'unknown',
        filename: v.filename,
        storage_path: v.storagePath,
        public_url: v.publicUrl,
        mime_type: v.mimeType,
        file_size: v.fileSize,
        width: v.width,
        height: v.height,
      }));

      await createMediaVariants(variantInserts);
    }

    return NextResponse.json(
      {
        ...asset,
        variants: uploadResult.variants,
      },
      { status: 201, headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}

// =============================================================================
// DELETE /api/admin/media - Bulk delete media assets
// =============================================================================

export async function DELETE(request: NextRequest) {
  // Authenticate
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-media-delete',
    identifier: clientIp,
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    // Validate body
    const body = await request.json();
    const bodyResult = deleteBodySchema.safeParse(body);

    if (!bodyResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: bodyResult.error.flatten() },
        { status: 400 }
      );
    }

    const { ids } = bodyResult.data;

    // Clear any references to these media assets (e.g., avatars)
    for (const id of ids) {
      await clearAvatarMediaReference(id);
    }

    // Collect all file paths before deletion
    const allPaths: string[] = [];
    for (const id of ids) {
      const paths = await getAllStoragePaths(id);
      allPaths.push(...paths);
    }

    // Delete from database (cascades to variants)
    const deletedCount = await deleteMediaAssets(ids);

    // Delete files from disk
    await deleteMediaFiles(allPaths);

    return NextResponse.json(
      { deleted: deletedCount, paths: allPaths.length },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Error deleting media:', error);
    return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
  }
}
