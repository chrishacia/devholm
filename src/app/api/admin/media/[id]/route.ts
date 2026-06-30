/**
 * Single Media Asset API Routes
 * =============================
 *
 * Secure endpoints for individual media asset operations:
 * - GET: Retrieve asset with variants
 * - PATCH: Update metadata (alt text, caption)
 * - DELETE: Remove asset and all files
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMediaAssetWithVariants,
  updateMediaAsset,
  deleteMediaAsset,
  getAllStoragePaths,
} from '@/db/media';
import { deleteMediaFiles } from '@/lib/image-processor';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyAdmin } from '@/lib/auth-helpers';

// =============================================================================
// Types
// =============================================================================

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const idSchema = z.string().uuid();

const updateBodySchema = z.object({
  altText: z.string().max(300, 'Alt text too long').optional(),
  caption: z.string().max(1000, 'Caption too long').optional(),
});

// =============================================================================
// GET /api/admin/media/[id] - Get a single media asset with variants
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Authenticate
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-media-get',
    identifier: clientIp,
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  // Validate ID
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid media ID' }, { status: 400 });
  }

  try {
    const asset = await getMediaAssetWithVariants(id);

    if (!asset) {
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
    }

    return NextResponse.json(asset, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error('Error fetching media asset:', error);
    return NextResponse.json({ error: 'Failed to fetch media asset' }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/admin/media/[id] - Update a media asset (alt text, caption)
// =============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Authenticate
  const token = await verifyAdmin(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    action: 'admin-media-update',
    identifier: clientIp,
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  // Validate ID
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid media ID' }, { status: 400 });
  }

  try {
    // Validate body
    const body = await request.json();
    const bodyResult = updateBodySchema.safeParse(body);

    if (!bodyResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: bodyResult.error.flatten() },
        { status: 400 }
      );
    }

    const { altText, caption } = bodyResult.data;

    // Build update object
    const updateData: { alt_text?: string | null; caption?: string | null } = {};
    if (altText !== undefined) {
      updateData.alt_text = altText || null;
    }
    if (caption !== undefined) {
      updateData.caption = caption || null;
    }

    // Perform update
    const updated = await updateMediaAsset(id, updateData);

    if (!updated) {
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
    }

    return NextResponse.json(updated, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error('Error updating media asset:', error);
    return NextResponse.json({ error: 'Failed to update media asset' }, { status: 500 });
  }
}

// =============================================================================
// DELETE /api/admin/media/[id] - Delete a media asset and all files
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

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

  // Validate ID
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: 'Invalid media ID' }, { status: 400 });
  }

  try {
    // Get all file paths before deletion
    const storagePaths = await getAllStoragePaths(id);

    if (storagePaths.length === 0) {
      return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
    }

    // Delete from database (cascades to variants)
    const deleted = await deleteMediaAsset(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete media asset' }, { status: 500 });
    }

    // Delete files from disk
    await deleteMediaFiles(storagePaths);

    return NextResponse.json(
      { success: true, filesDeleted: storagePaths.length },
      { headers: rateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Error deleting media asset:', error);
    return NextResponse.json({ error: 'Failed to delete media asset' }, { status: 500 });
  }
}
